-- Add mock_bot_win_enabled config key (default false)
INSERT INTO "config" (key, value, updated_at)
VALUES ('mock_bot_win_enabled', 'false', NOW())
ON CONFLICT (key) DO NOTHING;
