-- language: sql, file: db/migrations/004_share_plan_attachments.sql, target: Neon Postgres (idempoten)
-- (1) preview lampiran permanen di UI, (2) bagikan sesi lewat tautan, (3) paket langit Pro/Max.
-- CATATAN: jangan pakai blok DO $$ ... $$ di sini — scripts/migrate.mjs memecah per ';' dan
--          dollar-quoted string ikut terpotong. PLAN disimpan sebagai TEXT + CHECK.

ALTER TABLE messages ADD COLUMN IF NOT EXISTS attachments JSONB;

ALTER TABLE sessions ADD COLUMN IF NOT EXISTS share_enabled BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE users ADD COLUMN IF NOT EXISTS plan TEXT NOT NULL DEFAULT 'free';
ALTER TABLE user_subs ADD COLUMN IF NOT EXISTS plan TEXT;
ALTER TABLE sub_codes ADD COLUMN IF NOT EXISTS plan TEXT;

ALTER TABLE users DROP CONSTRAINT IF EXISTS users_plan_check;
ALTER TABLE users ADD CONSTRAINT users_plan_check CHECK (plan IN ('free', 'pro', 'max'));
