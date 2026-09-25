-- language: SQL, file: db/migrations/008_account_slots.sql, target: switch account multi-login
-- Slot akun per perangkat (cookie ai_handle): menyiapa saja akun yang pernah login di
-- peramban ini, supaya "Ganti akun" bisa kembali tanpa login ulang.
-- Token sesi TIDAK disimpan di sini (dibuat baru tiap pindah akun) - hanya siapa akunnya.

CREATE TABLE IF NOT EXISTS account_slots (
  handle    uuid         NOT NULL,
  user_id   uuid         NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  last_used timestamptz  NOT NULL DEFAULT now(),
  PRIMARY KEY (handle, user_id)
);

CREATE INDEX IF NOT EXISTS account_slots_user ON account_slots (user_id);
