-- language: sql, file: db/migrations/002_profile.sql, target: Neon Postgres (idempoten)
-- Profil di modal /#settings + bahasa untuk i18n ID/EN.
ALTER TABLE users ADD COLUMN IF NOT EXISTS avatar_url TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS personality TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS memory_enabled BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE users ADD COLUMN IF NOT EXISTS language TEXT NOT NULL DEFAULT 'id';
