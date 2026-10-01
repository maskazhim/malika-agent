-- Akun portal customer (login email + password, terpisah dari staff).
-- Dibuat otomatis saat checkout (dari password form) atau saat klaim pertama
-- dengan Order ID. pass_hash = SHA-256 hex dari password.
CREATE TABLE IF NOT EXISTS customers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT UNIQUE NOT NULL,
  pass_hash TEXT NOT NULL DEFAULT '',
  name TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT ''
);
CREATE INDEX IF NOT EXISTS idx_customers_email ON customers(email);
