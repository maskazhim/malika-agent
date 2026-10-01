-- Booking subdomain *.malika.ai (reservasi saja, routing diproses belakangan).
-- status: reserved (aktif dipakai), bisa diperluas ke provisioning/active nanti.
CREATE TABLE IF NOT EXISTS subdomains (
  subdomain TEXT PRIMARY KEY,
  order_id TEXT NOT NULL DEFAULT '',
  email TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'reserved',
  access_url TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT ''
);
CREATE INDEX IF NOT EXISTS idx_subdomains_order ON subdomains(order_id);
CREATE INDEX IF NOT EXISTS idx_subdomains_email ON subdomains(email);

-- Kolom baru di orders untuk subdomain + hash password pilihan customer.
-- password_hash = SHA-256 dari password yang diinput saat checkout.
ALTER TABLE orders ADD COLUMN subdomain TEXT NOT NULL DEFAULT '';
ALTER TABLE orders ADD COLUMN password_hash TEXT NOT NULL DEFAULT '';
CREATE INDEX IF NOT EXISTS idx_orders_subdomain ON orders(subdomain);

-- Kolom subdomain di clients untuk relasi booking.
ALTER TABLE clients ADD COLUMN subdomain TEXT NOT NULL DEFAULT '';
