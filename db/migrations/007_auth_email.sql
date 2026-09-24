-- autentikasi: email, nickname, provider OAuth, verifikasi OTP
ALTER TABLE users ADD COLUMN IF NOT EXISTS email text;
ALTER TABLE users ADD COLUMN IF NOT EXISTS nickname text;
ALTER TABLE users ADD COLUMN IF NOT EXISTS provider text NOT NULL DEFAULT 'local';
ALTER TABLE users ADD COLUMN IF NOT EXISTS provider_id text;
ALTER TABLE users ADD COLUMN IF NOT EXISTS email_verified boolean NOT NULL DEFAULT false;

CREATE UNIQUE INDEX IF NOT EXISTS users_email_key ON users (lower(email)) WHERE email IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS users_provider_key ON users (provider, provider_id) WHERE provider_id IS NOT NULL;

-- backfill dua akun lama (keputusan owner: email sudah ditentukan, terverifikasi)
UPDATE users SET email = 'onheilberkarya@gmail.com', nickname = COALESCE(nickname, 'ujicoba'), email_verified = true, provider = 'local' WHERE username = 'ujicoba';
UPDATE users SET email = 'shiraga.shirokami@gmail.com', nickname = COALESCE(nickname, 'Sakamura'), email_verified = true, provider = 'local' WHERE username = 'Sakamura';

-- kunci OTP verifikasi email (10 menit, maksimal 5 percobaan)
CREATE TABLE IF NOT EXISTS email_otps (
  email      text PRIMARY KEY,
  code       text NOT NULL,
  attempts   int  NOT NULL DEFAULT 0,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
