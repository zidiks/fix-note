-- Add note tags support

-- Each note has a single tag. "All" is a system fallback tag.
ALTER TABLE notes
ADD COLUMN IF NOT EXISTS tag TEXT NOT NULL DEFAULT 'All';

UPDATE notes
SET tag = 'All'
WHERE tag IS NULL OR btrim(tag) = '';

-- User-defined tags (excluding system "All")
CREATE TABLE IF NOT EXISTS note_tags (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    normalized_name TEXT GENERATED ALWAYS AS (lower(btrim(name))) STORED,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT note_tags_name_not_empty CHECK (length(btrim(name)) > 0),
    CONSTRAINT note_tags_user_normalized_name_unique UNIQUE (user_id, normalized_name)
);

CREATE INDEX IF NOT EXISTS idx_note_tags_user_id ON note_tags(user_id);

-- Backfill custom tags from existing notes.
INSERT INTO note_tags (user_id, name)
SELECT DISTINCT n.user_id, btrim(n.tag)
FROM notes n
WHERE n.tag IS NOT NULL
  AND btrim(n.tag) <> ''
  AND lower(btrim(n.tag)) <> 'all'
ON CONFLICT (user_id, normalized_name) DO NOTHING;
