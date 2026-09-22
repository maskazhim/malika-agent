-- Kode promo untuk potongan harga saat checkout.
-- type: 'percent' (value 1-100) atau 'fixed' (value rupiah).
-- max_uses 0 = tanpa batas. used_count naik saat order terverifikasi.
CREATE TABLE IF NOT EXISTS promos (
  code TEXT PRIMARY KEY,
  type TEXT NOT NULL DEFAULT 'percent',
  value INTEGER NOT NULL DEFAULT 0,
  max_uses INTEGER NOT NULL DEFAULT 0,
  used_count INTEGER NOT NULL DEFAULT 0,
  active INTEGER NOT NULL DEFAULT 1,
  expires_at TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT ''
);

-- Kode promo yang dipakai tiap order (untuk audit + hitung used_count).
ALTER TABLE orders ADD COLUMN promo_code TEXT NOT NULL DEFAULT '';
