-- language: SQL, file: db/migrations/005_generated_files.sql, target: berkas hasil create_file (docx/pdf/xlsx) milik user
CREATE TABLE IF NOT EXISTS generated_files (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name text NOT NULL,
  mime text NOT NULL,
  data bytea NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS generated_files_user_idx ON generated_files (user_id, created_at DESC);
