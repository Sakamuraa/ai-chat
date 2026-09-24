-- language: sql, file: db/migrations/003_subscription.sql, target: Neon Postgres (idempoten)
-- Kuota token + kode langganan.
--   token_usage : pemakaian token per user per hari UTC (batas harian default)
--   sub_codes   : kode yang dibuat admin (ujicoba) — token + masa berlaku
--   user_subs   : langganan aktif hasil redeem (sisa token menyusut tiap chat)

CREATE TABLE IF NOT EXISTS token_usage (
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  day DATE NOT NULL,
  tokens BIGINT NOT NULL DEFAULT 0,
  PRIMARY KEY (user_id, day)
);

CREATE TABLE IF NOT EXISTS sub_codes (
  code TEXT PRIMARY KEY,
  token_limit BIGINT,                      -- NULL = unlimited
  duration_hours INTEGER NOT NULL,         -- masa berlaku sejak diredeem
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  redeemed_by UUID REFERENCES users(id) ON DELETE SET NULL,
  redeemed_at TIMESTAMPTZ,
  revoked BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS user_subs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  source_code TEXT REFERENCES sub_codes(code) ON DELETE SET NULL,
  token_limit BIGINT,                      -- NULL = unlimited
  remaining BIGINT,                        -- NULL = unlimited
  valid_until TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_user_subs_active ON user_subs (user_id, valid_until DESC);
CREATE INDEX IF NOT EXISTS idx_sub_codes_redeemed ON sub_codes (redeemed_by);
