-- Penilaian support AI engineer oleh customer (bintang 0-5 + pesan opsional).
-- Satu baris per (customer_email, staff_username, period YYYY-MM WIB).
-- Revisi kapan saja dalam bulan berjalan = upsert baris yang sama;
-- ganti bulan = baris baru, baris lama otomatis final (API menolak ubah periode lampau).
CREATE TABLE IF NOT EXISTS support_ratings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  customer_email TEXT NOT NULL DEFAULT '',
  staff_username TEXT NOT NULL DEFAULT '',
  period TEXT NOT NULL DEFAULT '',
  stars INTEGER NOT NULL DEFAULT 0,
  message TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT '',
  updated_at TEXT NOT NULL DEFAULT '',
  UNIQUE(customer_email, staff_username, period)
);
CREATE INDEX IF NOT EXISTS idx_rating_staff_period ON support_ratings(staff_username, period);
CREATE INDEX IF NOT EXISTS idx_rating_customer ON support_ratings(customer_email);
