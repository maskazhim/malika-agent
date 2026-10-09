-- Cache hasil lookup IndoVM di deploy_configs agar UI tidak hit IndoVM tiap saat.
-- tempo mentah "dd/mm/yyyy" (vps_tempo) + versi ISO (vps_tempo_at) untuk sorting/expiry.
-- Diisi oleh POST /api/vps-sync dan cron harian payment-worker (1x sehari).
ALTER TABLE deploy_configs ADD COLUMN vps_status TEXT NOT NULL DEFAULT '';
ALTER TABLE deploy_configs ADD COLUMN vps_periode TEXT NOT NULL DEFAULT '';
ALTER TABLE deploy_configs ADD COLUMN vps_tempo TEXT NOT NULL DEFAULT '';
ALTER TABLE deploy_configs ADD COLUMN vps_tempo_at TEXT NOT NULL DEFAULT '';
ALTER TABLE deploy_configs ADD COLUMN vps_ip TEXT NOT NULL DEFAULT '';
ALTER TABLE deploy_configs ADD COLUMN vps_online INTEGER NOT NULL DEFAULT 0;
ALTER TABLE deploy_configs ADD COLUMN vps_synced_at TEXT NOT NULL DEFAULT '';
CREATE INDEX IF NOT EXISTS idx_deploy_configs_tempo ON deploy_configs(vps_tempo_at);
