-- Katalog harga paket yang bisa diubah dari dashboard admin.
-- Halaman publik mengambil dari /api/pricing, fallback ke data statis
-- bila API belum tersedia.
CREATE TABLE IF NOT EXISTS pricing (
  key TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  price INTEGER NOT NULL DEFAULT 0,
  period TEXT NOT NULL DEFAULT '/bulan',
  description TEXT NOT NULL DEFAULT '',
  features TEXT NOT NULL DEFAULT '[]',
  cta TEXT NOT NULL DEFAULT '',
  popular INTEGER NOT NULL DEFAULT 0
);

INSERT INTO pricing (key, name, price, period, description, features, cta, popular) VALUES
('starter', 'Starter', 1799000, '/bulan', 'Untuk 1 cabang yang mau delegasikan 1-2 kerjaan repetitif.',
 '["1 user","2 komputer AI aktif 24 jam","Koneksi internet 2 komputer AI 30 hari","Jalankan berbagai pekerjaan rutin secara otomatis","Akses model AI pilihan Malika","Pilih model AI Anda sendiri (Grok, GPT, Claude)","Integrasi MCP","Support Standard"]',
 'Pilih Starter', 0),
('growth', 'Growth', 4599000, '/bulan', 'Untuk bisnis bertumbuh dengan beberapa tim operasional.',
 '["Kuota penggunaan AI 3× lebih besar dari Starter","3 user","6 komputer AI aktif 24 jam","Koneksi internet 6 komputer AI 30 hari","Jalankan berbagai pekerjaan rutin secara otomatis","Akses model AI pilihan Malika","Pilih model AI Anda sendiri (Grok, GPT, Claude)","Integrasi MCP","Support Prioritas"]',
 'Pilih Growth', 1),
('scale', 'Scale', 10999000, '/bulan', 'Untuk multi-cabang & volume kerja operasional tinggi.',
 '["Kuota penggunaan AI 9× lebih besar dari Starter","6 user","12 komputer AI aktif 24 jam","Koneksi internet 12 komputer AI 30 hari","Jalankan berbagai pekerjaan rutin secara otomatis","Gunakan model AI pilihan Malika","Pilih model AI Anda sendiri (Grok, GPT, Claude)","Integrasi MCP","Integrasi khusus sesuai dengan kebutuhan bisnis Anda","Pendamping khusus untuk bisnis Anda"]',
 'Hubungi Kami', 0)
ON CONFLICT(key) DO NOTHING;
