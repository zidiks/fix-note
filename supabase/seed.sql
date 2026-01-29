-- Seed data for development/testing
-- This file is optional and only used for local development

-- Note: Replace 'your-telegram-id' with your actual Telegram user ID

-- Example: Insert test user
-- INSERT INTO users (telegram_id, username, first_name, language_code)
-- VALUES (123456789, 'testuser', 'Test', 'ru')
-- ON CONFLICT (telegram_id) DO NOTHING;

-- Example: Insert test notes (without embeddings - they will be added by the app)
-- INSERT INTO notes (user_id, content, summary, source)
-- SELECT id, 'Test note content', 'Test summary', 'text'
-- FROM users WHERE telegram_id = 123456789;


