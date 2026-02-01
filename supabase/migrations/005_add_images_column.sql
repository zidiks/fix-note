-- Add images column to notes table
-- This stores array of image URLs (Telegram file URLs or Supabase storage URLs)

ALTER TABLE notes ADD COLUMN IF NOT EXISTS images TEXT[] DEFAULT '{}';

-- Add index for notes with images (partial index for efficient filtering)
CREATE INDEX IF NOT EXISTS idx_notes_has_images ON notes((array_length(images, 1) > 0)) WHERE array_length(images, 1) > 0;

-- Comment for documentation
COMMENT ON COLUMN notes.images IS 'Array of image URLs attached to the note';

