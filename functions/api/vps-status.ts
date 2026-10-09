/* Cloudflare Pages Functions — /api/vps-status
   Lookup server IndoVM (flow yang dipakai Tab Server; mapping
   service_id = deploy_configs.vps_id). Token via env INDOVM_LOOKUP_TOKEN —
   JANGAN hardcode di repo. Set di dashboard Pages (Settings -> Secrets).

   Tiap lookup sukses OTOMATIS persist ke deploy_configs (cache harian:
   vps_tempo / vps_tempo_at / vps_synced_at, best-effort) agar UI + masa aktif
   baca dari database, bukan hit IndoVM tiap saat. Cron harian payment-worker
   memanggil flow yang sama (lihat functions/api/_indovm.ts).

   Akses: staff yang boleh edit config (lihat canEditConfig).

   GET — { ok, diambil_pada, synced: <baris terupdate>, vps: { [service_id]: {status, periode, tempo, ip, online} } }
*/

interface Env extends EnvBase {
  INDOVM_LOOKUP_TOKEN?: string;
  INDOVM_LOOKUP_URL?: string;
}

import { canEditConfig, cors, getSession, type EnvBase } from "./_auth";
import { lookupVps, persistVpsCache } from "./_indovm";

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
  try {
    const parsed = await lookupVps(token, env.INDOVM_LOOKUP_URL);
    // Persist ke DB (best-effort — response live tetap dikembalikan walau gagal).
    let synced = 0;
    try {
      synced = (await persistVpsCache(env.DB, parsed)).updated;
    } catch (e) {
      console.log(`[vps-status] persist cache dilewati: ${String(e).slice(0, 200)}`);
    }
    const vps: Record<string, { status: string; periode: string; tempo: string; ip: string; online: boolean }> = {};
    for (const [sid, v] of Object.entries(parsed)) {
      vps[sid] = { status: v.status, periode: v.periode, tempo: v.tempo, ip: v.ip, online: v.online };
    }
    return Response.json({ ok: true, diambil_pada: new Date().toISOString(), synced, vps }, { headers: cors });
  } catch (e) {
    const timeout = e instanceof Error && e.name === "AbortError";
    return new Response(
      JSON.stringify({ error: timeout ? "Lookup timeout (coba Refresh lagi)." : "Gagal lookup VPS." }),
      { status: timeout ? 504 : 502, headers: cors }
    );
  }
}
