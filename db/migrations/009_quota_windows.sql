-- language: sql, file: db/migrations/009_quota_windows.sql, target: Neon Postgres (idempoten)
-- Kuota ala Claude (permintaan Manuel, 2026-09-30): jendela 5 jam + mingguan.
--   quota_windows : pemakaian token per user per jendela
--     kind='5h'   -> period = floor(epoch_ms / 5 jam)   (reset otomatis tiap 5 jam)
--     kind='week' -> period = tanggal Senin UTC 'YYYY-MM-DD' (reset Senin 00.00 UTC)
--   token_usage tetap diisi sebagai riwayat harian (grafik/laporan), bukan dasar cek.

CREATE TABLE IF NOT EXISTS quota_windows (
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK (kind IN ('5h', 'week')),
  period TEXT NOT NULL,
  tokens BIGINT NOT NULL DEFAULT 0,
  PRIMARY KEY (user_id, kind, period)
);
