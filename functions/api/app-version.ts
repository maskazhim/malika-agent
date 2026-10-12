/* Cloudflare Pages Functions — /api/app-version
   Cek versi aplikasi tiap client (GET https://<web_domain>/api/version)
   lalu simpan ke deploy_configs (app_tag / app_revision / app_version_at).

   Akses: staff yang boleh edit config (lihat canEditConfig).

   GET — { ok, synced, versions: { [order_id]: {tag, revision, at} } }
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
import { fetchVersions, listVersionTargets, persistVersionCache } from "./_appversion";

export async function onRequestOptions() {
  return new Response(null, { status: 204, headers: cors });
}

export async function onRequestGet({ request, env }: { request: Request; env: Env }) {
  if (!env.DB) return new Response(JSON.stringify({ error: "D1 not bound" }), { status: 500, headers: cors });
  const s = await getSession(request, env);
  if (!s) return new Response(JSON.stringify({ error: "unauthorized" }), { status: 401, headers: cors });
  if (!canEditConfig(s)) return new Response(JSON.stringify({ error: "forbidden" }), { status: 403, headers: cors });
  try {
    const targets = await listVersionTargets(env.DB);
    const versions = await fetchVersions(targets);
    // Persist ke DB (best-effort — response live tetap dikembalikan walau gagal).
    let synced = 0;
    try {
      synced = (await persistVersionCache(env.DB, versions)).updated;
    } catch (e) {
      console.log(`[app-version] persist cache dilewati: ${String(e).slice(0, 200)}`);
    }
    return Response.json({ ok: true, synced, versions }, { headers: cors });
  } catch {
    return new Response(JSON.stringify({ error: "Gagal cek versi." }), { status: 502, headers: cors });
  }
}
