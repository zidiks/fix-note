-- Add title column to notes (AI-generated or fallback)
ALTER TABLE notes ADD COLUMN IF NOT EXISTS title TEXT;
