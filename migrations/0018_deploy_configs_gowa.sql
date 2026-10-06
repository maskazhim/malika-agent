-- Kolom gowa_domain di deploy_configs (pattern gowa-{subdomain}.malika.ai).
ALTER TABLE deploy_configs ADD COLUMN gowa_domain TEXT NOT NULL DEFAULT '';
