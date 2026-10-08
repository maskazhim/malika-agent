/* Cloudflare Pages Functions — /api/vps-status
   Proxy lookup server IndoVM (mapping service_id = deploy_configs.vps_id).
   Token via env INDOVM_LOOKUP_TOKEN — JANGAN hardcode di repo.
   Set di dashboard Pages (Settings -> Environment variables) + Secrets.

   Akses: staff yang boleh edit config (lihat canEditConfig).

   GET — { ok, diambil_pada, vps: { [service_id]: {status, periode, tempo, ip, online} } }
*/

interface Env extends EnvBase {
  INDOVM_LOOKUP_TOKEN?: string;
  INDOVM_LOOKUP_URL?: string;
}

import { canEditConfig, cors, getSession, type EnvBase } from "./_auth";

const DEFAULT_URL = "https://flow-new.malika.ai/webhook/lookup-server-indovm";

interface VpsEntry {
  service_id?: unknown;
  status_layanan?: unknown;
  periode_pembayaran?: unknown;
  jatuh_tempo?: unknown;
  akses?: { ip?: unknown };
  penggunaan?: { online?: unknown };
}

export async function onRequestOptions() {
  return new Response(null, { status: 204, headers: cors });
}

export async function onRequestGet({ request, env }: { request: Request; env: Env }) {
  if (!env.DB) return new Response(JSON.stringify({ error: "D1 not bound" }), { status: 500, headers: cors });
  const s = await getSession(request, env);
  if (!s) return new Response(JSON.stringify({ error: "unauthorized" }), { status: 401, headers: cors });
  if (!canEditConfig(s)) return new Response(JSON.stringify({ error: "forbidden" }), { status: 403, headers: cors });
  const token = (env.INDOVM_LOOKUP_TOKEN ?? "").trim();
  if (!token) {
    return new Response(JSON.stringify({ error: "Token lookup belum dikonfigurasi (INDOVM_LOOKUP_TOKEN)." }), {
      status: 500,
      headers: cors,
    });
  }
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), 25000);
  try {
    const res = await fetch(env.INDOVM_LOOKUP_URL || DEFAULT_URL, {
      headers: { Authorization: token },
      signal: ctl.signal,
    });
    if (!res.ok) throw new Error(`lookup ${res.status}`);
    const raw = (await res.json()) as { vps?: VpsEntry[] }[] | { vps?: VpsEntry[] };
    const list = Array.isArray(raw) ? raw.flatMap((g) => g.vps ?? []) : raw.vps ?? [];
    const vps: Record<string, { status: string; periode: string; tempo: string; ip: string; online: boolean }> = {};
    for (const v of list) {
      const sid = String(v.service_id ?? "");
      if (!sid) continue;
      vps[sid] = {
        status: String(v.status_layanan ?? ""),
        periode: String(v.periode_pembayaran ?? ""),
        tempo: String(v.jatuh_tempo ?? ""),
        ip: String(v.akses?.ip ?? "").split(";")[0].trim(),
        online: v.penggunaan?.online === true,
      };
    }
    return Response.json({ ok: true, diambil_pada: new Date().toISOString(), vps }, { headers: cors });
  } catch (e) {
    const timeout = e instanceof Error && e.name === "AbortError";
    return new Response(
      JSON.stringify({ error: timeout ? "Lookup timeout (coba Refresh lagi)." : "Gagal lookup VPS." }),
      { status: timeout ? 504 : 502, headers: cors }
    );
  } finally {
    clearTimeout(timer);
  }
}
