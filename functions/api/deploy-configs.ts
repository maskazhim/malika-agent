/* Cloudflare Pages Functions — /api/deploy-configs
   Baca/ubah skeleton deploy per order (lihat tabel deploy_configs).
   Row dibuat otomatis saat checkout (POST /api/orders); di sini hanya
   dibaca & dilengkapi saat setup server.

   Akses (staff pelaksana setup + admin, lihat canEditConfig):
      GET   ?order_id=xxx — satu config; tanpa param = daftar semua
      PATCH {order_id, ...kolom} — upsert kolom allowlist
*/

interface D1Prepared {
  bind(...values: unknown[]): D1Prepared;
  first<T = Record<string, unknown>>(): Promise<T | null>;
  all<T = Record<string, unknown>>(): Promise<{ results: T[] }>;
  run(): Promise<unknown>;
}
interface D1Database {
  prepare(query: string): D1Prepared;
}
interface Env {
  DB: D1Database;
  SESSION_SECRET?: string;
}

import { canEditConfig, cors, getSession } from "./_auth";

const ALLOW = [
  "client_name",
  "short_name",
  "server_name",
  "project_name",
  "compose_name",
  "environment_name",
  "server_ip",
  "server_user",
  "ssh_port",
  "ssh_key_ref",
  "web_domain",
  "connector_domain",
  "router_domain",
  "gowa_domain",
  "cloudflare_zone",
  "letsencrypt_email",
  "proxy_awal",
  "compose_provider",
  "compose_repo",
  "compose_branch",
  "compose_trigger",
  "env_template",
  "secrets_json",
  "secrets_is_dummy",
  "dokploy_server_id",
  "dokploy_project_id",
  "dokploy_env_id",
  "dokploy_compose_id",
  "deploy_status",
  "last_log",
];
const INT_COLS = new Set(["ssh_port", "proxy_awal", "secrets_is_dummy"]);
const LONG_COLS = new Set(["secrets_json", "last_log"]);

export async function onRequestOptions() {
  return new Response(null, { status: 204, headers: cors });
}

// GET /api/deploy-configs?order_id=xxx — baca satu config.
// GET /api/deploy-configs — daftar semua (tab Server).
export async function onRequestGet({ request, env }: { request: Request; env: Env }) {
  if (!env.DB) return new Response(JSON.stringify({ error: "D1 not bound" }), { status: 500, headers: cors });
  const s = await getSession(request, env);
  if (!s) return new Response(JSON.stringify({ error: "unauthorized" }), { status: 401, headers: cors });
  if (!canEditConfig(s)) return new Response(JSON.stringify({ error: "forbidden" }), { status: 403, headers: cors });
  const order_id = (new URL(request.url).searchParams.get("order_id") ?? "").slice(0, 64);
  if (!order_id) {
    const { results } = await env.DB.prepare(
      "SELECT * FROM deploy_configs ORDER BY updated_at DESC LIMIT 500"
    ).all();
    return Response.json({ ok: true, configs: results ?? [] }, { headers: cors });
  }
  const row = await env.DB.prepare("SELECT * FROM deploy_configs WHERE order_id = ?").bind(order_id).first();
  if (!row) return new Response(JSON.stringify({ error: "not found" }), { status: 404, headers: cors });
  return Response.json({ ok: true, config: row }, { headers: cors });
}

// PATCH /api/deploy-configs {order_id, ...kolom} — upsert kolom allowlist.
export async function onRequestPatch({ request, env }: { request: Request; env: Env }) {
  if (!env.DB) return new Response(JSON.stringify({ error: "D1 not bound" }), { status: 500, headers: cors });
  const s = await getSession(request, env);
  if (!s) return new Response(JSON.stringify({ error: "unauthorized" }), { status: 401, headers: cors });
  if (!canEditConfig(s)) return new Response(JSON.stringify({ error: "forbidden" }), { status: 403, headers: cors });
  let b: Record<string, unknown>;
  try {
    b = (await request.json()) as Record<string, unknown>;
  } catch {
    return new Response(JSON.stringify({ error: "invalid json" }), { status: 400, headers: cors });
  }
  const order_id = String(b.order_id ?? "").slice(0, 64);
  if (!order_id) return new Response(JSON.stringify({ error: "order_id required" }), { status: 400, headers: cors });

  const cols: string[] = [];
  const vals: unknown[] = [];
  for (const c of ALLOW) {
    if (b[c] === undefined || b[c] === null) continue;
    if (INT_COLS.has(c)) {
      const n = Number(b[c]);
      vals.push(Number.isFinite(n) ? Math.round(n) : 0);
    } else {
      vals.push(String(b[c]).slice(0, LONG_COLS.has(c) ? 8000 : 256));
    }
    cols.push(c);
  }
  if (cols.length === 0) {
    return new Response(JSON.stringify({ error: "tidak ada perubahan" }), { status: 400, headers: cors });
  }
  const now = new Date().toISOString();
  await env.DB.prepare(
    `INSERT INTO deploy_configs (order_id, ${cols.join(", ")}, created_at, updated_at)
     VALUES (?, ${cols.map(() => "?").join(", ")}, ?, ?)
     ON CONFLICT(order_id) DO UPDATE SET ${cols.map((c) => `${c}=excluded.${c}`).join(", ")}, updated_at=excluded.updated_at`
  )
    .bind(order_id, ...vals, now, now)
    .run();
  return Response.json({ ok: true, order_id, changed: cols }, { headers: cors });
}
