-- Konfigurasi deployment per order (ditulis otomatisasi Dokploy/deploy eksternal).
-- Sudah ada di D1 production sebagai `deploy_configs`; migrasi ini menyelaraskan
-- repo/local agar `wrangler d1 migrations apply --local` menghasilkan skema yang sama.
-- Catatan urutan: file ini ("0018_deploy_configs.sql") jalan SEBELUM
-- "0018_deploy_configs_gowa.sql" (sort abjad), jadi kolom gowa_domain SENGAJA
-- tidak ada di sini — ditambahkan oleh migrasi gowa tersebut.
-- vps_id ikut di sini karena belum ada migrasi lain yang menambahkannya.
CREATE TABLE IF NOT EXISTS deploy_configs (
  order_id TEXT PRIMARY KEY,
  client_name TEXT NOT NULL DEFAULT '',
  short_name TEXT NOT NULL DEFAULT '',
  server_name TEXT NOT NULL DEFAULT '',
  project_name TEXT NOT NULL DEFAULT '',
  compose_name TEXT NOT NULL DEFAULT 'Agentic',
  environment_name TEXT NOT NULL DEFAULT 'production',
  server_ip TEXT NOT NULL DEFAULT '',
  server_user TEXT NOT NULL DEFAULT 'root',
  ssh_port INTEGER NOT NULL DEFAULT 22,
  ssh_key_ref TEXT NOT NULL DEFAULT '',
  web_domain TEXT NOT NULL DEFAULT '',
  connector_domain TEXT NOT NULL DEFAULT '',
  router_domain TEXT NOT NULL DEFAULT '',
  cloudflare_zone TEXT NOT NULL DEFAULT '',
  letsencrypt_email TEXT NOT NULL DEFAULT '',
  proxy_awal INTEGER NOT NULL DEFAULT 0,
  compose_provider TEXT NOT NULL DEFAULT '',
  compose_repo TEXT NOT NULL DEFAULT 'malika-agent-compose',
  compose_branch TEXT NOT NULL DEFAULT 'main',
  compose_trigger TEXT NOT NULL DEFAULT 'Tag',
  env_template TEXT NOT NULL DEFAULT '.env.example',
  secrets_json TEXT NOT NULL DEFAULT '{}',
  secrets_is_dummy INTEGER NOT NULL DEFAULT 1,
  dokploy_server_id TEXT NOT NULL DEFAULT '',
  dokploy_project_id TEXT NOT NULL DEFAULT '',
  dokploy_env_id TEXT NOT NULL DEFAULT '',
  dokploy_compose_id TEXT NOT NULL DEFAULT '',
  deploy_status TEXT NOT NULL DEFAULT 'pending',
  last_log TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT '',
  updated_at TEXT NOT NULL DEFAULT '',
  vps_id TEXT NOT NULL DEFAULT ''
);
CREATE INDEX IF NOT EXISTS idx_deploy_configs_short_name ON deploy_configs(short_name);
