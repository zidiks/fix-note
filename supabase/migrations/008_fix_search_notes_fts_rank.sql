-- Fix search_notes_fts rank type mismatch (ts_rank returns real)

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
    rank DOUBLE PRECISION
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
        )::double precision AS rank
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

COMMENT ON FUNCTION search_notes_fts IS 'Full-text search for notes using precomputed tsvector, excludes soft-deleted notes';
