-- Pipeline pasca-verifikasi: verified -> setup_server -> retensi,
-- cabang retensi -> churn / resubscribe. onboard_done = flag paralel
-- (onboarding jalan bersamaan dengan setup server).
-- retensi_at = awal masa aktif 30 hari (diset saat masuk retensi,
-- diperbarui tiap resubscribe). renewal_count = jumlah perpanjangan.
ALTER TABLE orders ADD COLUMN onboard_done INTEGER NOT NULL DEFAULT 0;
ALTER TABLE orders ADD COLUMN retensi_at TEXT NOT NULL DEFAULT '';
ALTER TABLE orders ADD COLUMN renewal_count INTEGER NOT NULL DEFAULT 0;
ALTER TABLE orders ADD COLUMN last_reminder_at TEXT NOT NULL DEFAULT '';
