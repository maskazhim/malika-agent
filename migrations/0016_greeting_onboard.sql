-- Pipeline baru: verified -> setup_server -> onboard -> retensi.
-- greeting_done = flag paralel "menyapa customer baru" (pengganti onboard_done
-- yang dulu jalan bareng setup server). onboard_done dipertahankan sementara
-- untuk kompatibilitas baca/tulis lama (disinkron dengan greeting_done).
ALTER TABLE orders ADD COLUMN greeting_done INTEGER NOT NULL DEFAULT 0;
