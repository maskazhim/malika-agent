-- Cache versi aplikasi client (GET https://<web_domain>/api/version -> {tag, revision}).
-- Diisi oleh GET /api/app-version dan cron harian payment-worker (1x sehari).
ALTER TABLE deploy_configs ADD COLUMN app_tag TEXT NOT NULL DEFAULT '';
ALTER TABLE deploy_configs ADD COLUMN app_revision TEXT NOT NULL DEFAULT '';
ALTER TABLE deploy_configs ADD COLUMN app_version_at TEXT NOT NULL DEFAULT '';
