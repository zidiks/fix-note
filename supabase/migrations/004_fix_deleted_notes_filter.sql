-- Migration: Fix deleted notes filtering
-- Description: Update search function to exclude soft-deleted notes

-- Update search_notes function to filter out deleted notes
CREATE OR REPLACE FUNCTION search_notes(
    query_embedding extensions.vector(1536),
    match_count INT DEFAULT 5,
    match_user_id UUID DEFAULT NULL
)
RETURNS TABLE (
    id UUID,
    content TEXT,
    summary TEXT,
    similarity FLOAT,
    created_at TIMESTAMPTZ
)
LANGUAGE plpgsql
AS $$
BEGIN
    RETURN QUERY
    SELECT
        n.id,
        n.content,
        n.summary,
        1 - (n.embedding <=> query_embedding) AS similarity,
        n.created_at
    FROM notes n
    WHERE 
        (match_user_id IS NULL OR n.user_id = match_user_id)
        AND n.embedding IS NOT NULL
        AND n.deleted_at IS NULL  -- Exclude soft-deleted notes
    ORDER BY n.embedding <=> query_embedding
    LIMIT match_count;
END;
$$;

-- Create FTS search function if not exists (with deleted_at filter)
CREATE OR REPLACE FUNCTION search_notes_fts(
    search_query TEXT,
    match_user_id UUID,
    match_limit INT DEFAULT 20
)
RETURNS TABLE (
    id UUID,
    content TEXT,
    summary TEXT,
    source VARCHAR(10),
    created_at TIMESTAMPTZ,
    rank FLOAT
)
LANGUAGE plpgsql
AS $$
BEGIN
    RETURN QUERY
    SELECT
        n.id,
        n.content,
        n.summary,
        n.source,
        n.created_at,
        ts_rank(
            to_tsvector('russian', COALESCE(n.content, '') || ' ' || COALESCE(n.summary, '')),
            plainto_tsquery('russian', search_query)
        ) AS rank
    FROM notes n
    WHERE 
        n.user_id = match_user_id
        AND n.deleted_at IS NULL  -- Exclude soft-deleted notes
        AND (
            to_tsvector('russian', COALESCE(n.content, '') || ' ' || COALESCE(n.summary, ''))
            @@ plainto_tsquery('russian', search_query)
        )
    ORDER BY rank DESC
    LIMIT match_limit;
END;
$$;

-- Add comment for documentation
COMMENT ON FUNCTION search_notes IS 'Semantic search for notes using embeddings, excludes soft-deleted notes';
COMMENT ON FUNCTION search_notes_fts IS 'Full-text search for notes using PostgreSQL FTS, excludes soft-deleted notes';


