-- Akun staff multi-divisi (login username + password).
-- pass_hash = SHA-256 hex dari password.
-- division: marketing | sales | support | it | ai_engineer | retensi | bisdev | admin
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT UNIQUE NOT NULL,
  pass_hash TEXT NOT NULL DEFAULT '',
  name TEXT NOT NULL DEFAULT '',
  division TEXT NOT NULL DEFAULT 'support',
  is_admin INTEGER NOT NULL DEFAULT 0,
  active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT ''
);

-- Admin pertama.
INSERT INTO users (username, pass_hash, name, division, is_admin, active, created_at)
VALUES ('kazhim', '0c1100d5a20245070600cbb98d54f3a3a2b4ea2f9ad7a5e4cd6ac9a9c5cdb760', 'Kazhim', 'admin', 1, 1, '')
ON CONFLICT(username) DO NOTHING;
