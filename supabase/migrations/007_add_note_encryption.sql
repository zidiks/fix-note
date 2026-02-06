-- Add encryption fields for notes and users

-- Users: per-user wrapped data key
ALTER TABLE users
ADD COLUMN IF NOT EXISTS notes_key_enc TEXT NOT NULL DEFAULT '',
ADD COLUMN IF NOT EXISTS notes_key_version INTEGER NOT NULL DEFAULT 1;

-- Notes: encrypted fields + hashes + search vector
ALTER TABLE notes
ADD COLUMN IF NOT EXISTS content_enc TEXT,
ADD COLUMN IF NOT EXISTS summary_enc TEXT,
ADD COLUMN IF NOT EXISTS title_enc TEXT,
ADD COLUMN IF NOT EXISTS enc_version INTEGER NOT NULL DEFAULT 1,
ADD COLUMN IF NOT EXISTS content_hash TEXT,
ADD COLUMN IF NOT EXISTS summary_hash TEXT,
ADD COLUMN IF NOT EXISTS title_hash TEXT,
ADD COLUMN IF NOT EXISTS search_vector tsvector,
ADD COLUMN IF NOT EXISTS search_lang TEXT DEFAULT 'russian';

-- Allow plaintext content to be NULL (encrypted storage)
ALTER TABLE notes ALTER COLUMN content DROP NOT NULL;

-- Index for FTS
CREATE INDEX IF NOT EXISTS idx_notes_search_vector ON notes USING GIN (search_vector);

-- Drop old functions with incompatible return types
DROP TRIGGER IF EXISTS trigger_mark_note_needs_sync ON notes;
DROP FUNCTION IF EXISTS search_notes(extensions.vector, integer, uuid);
DROP FUNCTION IF EXISTS search_notes_fts(text, uuid, integer);
DROP FUNCTION IF EXISTS get_notes_pending_sync(uuid, uuid);
DROP FUNCTION IF EXISTS mark_note_needs_sync();
DROP FUNCTION IF EXISTS update_note_search_vector(uuid, text, text);

-- Update search vector using plaintext (not stored)
CREATE OR REPLACE FUNCTION update_note_search_vector(
    p_note_id UUID,
    p_search_text TEXT,
    p_lang TEXT DEFAULT 'russian'
)
RETURNS VOID
LANGUAGE plpgsql
AS $$
DECLARE
    v_lang TEXT := COALESCE(NULLIF(p_lang, ''), 'russian');
BEGIN
    UPDATE notes
    SET search_lang = v_lang,
        search_vector = to_tsvector(v_lang::regconfig, COALESCE(p_search_text, ''))
    WHERE id = p_note_id;
END;
$$;

-- Semantic search function (no plaintext fields)
CREATE OR REPLACE FUNCTION search_notes(
    query_embedding extensions.vector(1536),
    match_count INT DEFAULT 5,
    match_user_id UUID DEFAULT NULL
)
RETURNS TABLE (
    id UUID,
    similarity FLOAT,
    created_at TIMESTAMPTZ
)
LANGUAGE plpgsql
AS $$
BEGIN
    RETURN QUERY
    SELECT
        n.id,
        1 - (n.embedding <=> query_embedding) AS similarity,
        n.created_at
    FROM notes n
    WHERE 
        (match_user_id IS NULL OR n.user_id = match_user_id)
        AND n.embedding IS NOT NULL
        AND n.deleted_at IS NULL
    ORDER BY n.embedding <=> query_embedding
    LIMIT match_count;
END;
$$;

-- FTS search function using precomputed tsvector (no plaintext fields)
CREATE OR REPLACE FUNCTION search_notes_fts(
    search_query TEXT,
    match_user_id UUID,
    match_limit INT DEFAULT 20
)
RETURNS TABLE (
    id UUID,
    source VARCHAR(10),
    duration_seconds INTEGER,
    images TEXT[],
    voice_url TEXT,
    created_at TIMESTAMPTZ,
    rank FLOAT
)
LANGUAGE plpgsql
AS $$
BEGIN
    RETURN QUERY
    SELECT
        n.id,
        n.source,
        n.duration_seconds,
        COALESCE(n.images, ARRAY[]::TEXT[]) AS images,
        n.voice_url,
        n.created_at,
        ts_rank(
            n.search_vector,
            plainto_tsquery(COALESCE(n.search_lang, 'russian')::regconfig, search_query)
        ) AS rank
    FROM notes n
    WHERE 
        n.user_id = match_user_id
        AND n.deleted_at IS NULL
        AND n.search_vector IS NOT NULL
        AND (
            n.search_vector
            @@ plainto_tsquery(COALESCE(n.search_lang, 'russian')::regconfig, search_query)
        )
    ORDER BY rank DESC
    LIMIT match_limit;
END;
$$;

-- Update sync trigger to use hashes
CREATE OR REPLACE FUNCTION mark_note_needs_sync()
RETURNS TRIGGER AS $$
BEGIN
    IF OLD.content_hash IS DISTINCT FROM NEW.content_hash
       OR OLD.summary_hash IS DISTINCT FROM NEW.summary_hash
       OR OLD.title_hash IS DISTINCT FROM NEW.title_hash THEN
        NEW.needs_sync := true;
        NEW.content_version := COALESCE(OLD.content_version, 0) + 1;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Notes pending sync should not expose plaintext
CREATE OR REPLACE FUNCTION get_notes_pending_sync(p_user_id UUID, p_integration_id UUID)
RETURNS TABLE (
    note_id UUID,
    source VARCHAR(20),
    local_version INTEGER,
    sync_status sync_status,
    external_id VARCHAR(255),
    created_at TIMESTAMPTZ,
    updated_at TIMESTAMPTZ
)
LANGUAGE plpgsql
AS $$
BEGIN
    RETURN QUERY
    SELECT 
        n.id as note_id,
        n.source,
        n.content_version as local_version,
        COALESCE(nss.sync_status, 'pending'::sync_status) as sync_status,
        nss.external_id,
        n.created_at,
        n.updated_at
    FROM notes n
    LEFT JOIN note_sync_status nss ON n.id = nss.note_id AND nss.integration_id = p_integration_id
    WHERE n.user_id = p_user_id
      AND n.deleted_at IS NULL
      AND (n.needs_sync = true OR nss.id IS NULL OR nss.sync_status IN ('pending', 'error'))
    ORDER BY n.updated_at DESC;
END;
$$;

COMMENT ON FUNCTION update_note_search_vector IS 'Update FTS vector for a note without storing plaintext';
COMMENT ON FUNCTION search_notes IS 'Semantic search for notes using embeddings, excludes soft-deleted notes';
COMMENT ON FUNCTION search_notes_fts IS 'Full-text search for notes using precomputed tsvector, excludes soft-deleted notes';
