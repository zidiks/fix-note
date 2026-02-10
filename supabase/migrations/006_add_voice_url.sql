-- Add voice_url column to notes table
-- This stores the URL of the voice file (Telegram file URL or Supabase storage URL)

ALTER TABLE notes ADD COLUMN IF NOT EXISTS voice_url TEXT;

-- Add index for notes with voice (partial index for efficient filtering)
CREATE INDEX IF NOT EXISTS idx_notes_has_voice ON notes(voice_url) WHERE voice_url IS NOT NULL;

-- Comment for documentation
COMMENT ON COLUMN notes.voice_url IS 'URL of the voice file for voice notes';






