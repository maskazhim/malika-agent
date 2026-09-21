-- Kode unik QRIS 1-999 untuk verifikasi pembayaran otomatis.
-- Aturan pakai: kode milik order verified/cancelled/expired (>1 hari)
-- bebas dipakai ulang. Kolom unique_code NULL = belum dialokasikan.
ALTER TABLE orders ADD COLUMN unique_code INTEGER;
ALTER TABLE orders ADD COLUMN code_expires_at TEXT NOT NULL DEFAULT '';
-- SQLite mengizinkan banyak NULL di UNIQUE INDEX, jadi reuse kode
-- setelah di-NULL-kan (saat verified/cancelled) tetap aman + anti-dobel
-- untuk order aktif.
CREATE UNIQUE INDEX IF NOT EXISTS idx_orders_unique_code ON orders(unique_code);
CREATE INDEX IF NOT EXISTS idx_orders_code_expires ON orders(code_expires_at);
