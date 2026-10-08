-- Kolom vps_id di deploy_configs (mapping service_id lookup IndoVM).
ALTER TABLE deploy_configs ADD COLUMN vps_id TEXT NOT NULL DEFAULT '';
CREATE INDEX IF NOT EXISTS idx_deploy_configs_vps ON deploy_configs(vps_id);
