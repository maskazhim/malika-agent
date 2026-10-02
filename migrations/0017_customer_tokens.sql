-- Token magic link login customer (sekali pakai, kedaluwarsa cepat).
-- token_hash = SHA-256 hex dari token (token plain tidak pernah disimpan).
-- purpose: 'login' (klaim pertama / lupa password — sama-sama login).
CREATE TABLE IF NOT EXISTS customer_tokens (
  token_hash TEXT PRIMARY KEY,
  email TEXT NOT NULL DEFAULT '',
  purpose TEXT NOT NULL DEFAULT 'login',
  expires_at TEXT NOT NULL DEFAULT '',
  used_at TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT ''
);
CREATE INDEX IF NOT EXISTS idx_customer_tokens_email ON customer_tokens(email);
