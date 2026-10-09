-- Assignment PIC staff per customer email (satu baris per email, lowercase).
-- Divisi single-person (sales, marketing, support, it, retensi) tetap disimpan
-- agar siap bila nanti ada pembagian; ai_engineer dirotasi by load.
-- Hanya admin / bisdev yang boleh assign/reassign (ditegakkan di API).
CREATE TABLE IF NOT EXISTS client_assignments (
  email TEXT PRIMARY KEY,
  sales TEXT NOT NULL DEFAULT '',
  marketing TEXT NOT NULL DEFAULT '',
  support TEXT NOT NULL DEFAULT '',
  it TEXT NOT NULL DEFAULT '',
  ai_engineer TEXT NOT NULL DEFAULT '',
  retensi TEXT NOT NULL DEFAULT '',
  updated_at TEXT NOT NULL DEFAULT '',
  updated_by TEXT NOT NULL DEFAULT ''
);
CREATE INDEX IF NOT EXISTS idx_assign_ai ON client_assignments(ai_engineer);
