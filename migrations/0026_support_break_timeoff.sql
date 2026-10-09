-- Jam istirahat default (pengurang slot) + tanggal cuti per staff (exclude).
-- break kosong ('') = tanpa istirahat.
ALTER TABLE support_settings ADD COLUMN break_start TEXT NOT NULL DEFAULT '12:00';
ALTER TABLE support_settings ADD COLUMN break_end TEXT NOT NULL DEFAULT '13:00';

CREATE TABLE IF NOT EXISTS support_timeoff (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  staff_username TEXT NOT NULL DEFAULT '',
  date TEXT NOT NULL DEFAULT '',
  note TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT '',
  created_by TEXT NOT NULL DEFAULT ''
);
CREATE INDEX IF NOT EXISTS idx_timeoff_staff ON support_timeoff(staff_username, date);
