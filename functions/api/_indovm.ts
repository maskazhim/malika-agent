/* Satu-satunya flow lookup server IndoVM (dipakai Tab Server + cron harian).
   File underscore = tidak jadi route, hanya untuk diimpor.
   Mapping: service_id = deploy_configs.vps_id.
   Token via env INDOVM_LOOKUP_TOKEN — JANGAN hardcode di repo.

   - lookupVps(): fetch + parse mentah -> map per service_id.
   - tempoToIso(): "dd/mm/yyyy" -> "yyyy-mm-dd" (untuk kolom vps_tempo_at).
   - persistVpsCache(): simpan hasil lookup ke deploy_configs (cache harian
     agar UI tidak hit IndoVM tiap saat). Best-effort, return jumlah baris.
*/

export const INDOVM_DEFAULT_URL = "https://flow-new.malika.ai/webhook/lookup-server-indovm";

interface D1Prepared {
  bind(...values: unknown[]): D1Prepared;
  first<T = Record<string, unknown>>(): Promise<T | null>;
  all<T = Record<string, unknown>>(): Promise<{ results: T[] }>;
  run(): Promise<unknown>;
}
export interface D1Database {
  prepare(query: string): D1Prepared;
}

export interface VpsRaw {
  service_id?: unknown;
  status_layanan?: unknown;
  periode_pembayaran?: unknown;
  jatuh_tempo?: unknown;
  akses?: { ip?: unknown };
  penggunaan?: { online?: unknown };
}

export interface VpsParsed {
  status: string;
  periode: string;
  tempo: string;
  tempo_at: string;
  ip: string;
  online: boolean;
}

/* "dd/mm/yyyy" -> "yyyy-mm-dd". Invalid = "". */
export function tempoToIso(t: string): string {
  const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec((t || "").trim());
  if (!m) return "";
  const dd = Number(m[1]);
  const mm = Number(m[2]);
  const yyyy = Number(m[3]);
  if (dd < 1 || dd > 31 || mm < 1 || mm > 12 || yyyy < 2000 || yyyy > 2100) return "";
  const d = new Date(Date.UTC(yyyy, mm - 1, dd));
  if (d.getUTCFullYear() !== yyyy || d.getUTCMonth() !== mm - 1 || d.getUTCDate() !== dd) return "";
  return `${m[3]}-${m[2]}-${m[1]}`;
}

function parseOne(v: VpsRaw): VpsParsed {
  const tempo = String(v.jatuh_tempo ?? "").trim();
  return {
    status: String(v.status_layanan ?? "").slice(0, 64),
    periode: String(v.periode_pembayaran ?? "").slice(0, 64),
    tempo: tempo.slice(0, 32),
    tempo_at: tempoToIso(tempo),
    ip: String(v.akses?.ip ?? "").split(";")[0].trim().slice(0, 128),
    online: v.penggunaan?.online === true,
  };
}

/* Fetch lookup IndoVM -> map service_id => parsed. Throw bila gagal/timeout. */
export async function lookupVps(token: string, url?: string): Promise<Record<string, VpsParsed>> {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), 25000);
  try {
    const res = await fetch(url?.trim() || INDOVM_DEFAULT_URL, {
      headers: { Authorization: token },
      signal: ctl.signal,
    });
    if (!res.ok) throw new Error(`lookup ${res.status}`);
    const raw = (await res.json()) as { vps?: VpsRaw[] }[] | { vps?: VpsRaw[] };
    const list = Array.isArray(raw) ? raw.flatMap((g) => g.vps ?? []) : raw.vps ?? [];
    const out: Record<string, VpsParsed> = {};
    for (const v of list) {
      const sid = String(v.service_id ?? "").trim();
      if (!sid) continue;
      out[sid] = parseOne(v);
    }
    return out;
  } finally {
    clearTimeout(timer);
  }
}

/* Simpan hasil lookup ke deploy_configs (WHERE vps_id). Return {updated, synced_at}. */
export async function persistVpsCache(
  db: D1Database,
  vps: Record<string, VpsParsed>
): Promise<{ updated: number; synced_at: string }> {
  const now = new Date().toISOString();
  let updated = 0;
  for (const [sid, v] of Object.entries(vps)) {
    const r = (await db.prepare(
      `UPDATE deploy_configs SET vps_status = ?, vps_periode = ?, vps_tempo = ?,
        vps_tempo_at = ?, vps_ip = ?, vps_online = ?, vps_synced_at = ?, updated_at = ?
       WHERE vps_id = ?`
    )
      .bind(v.status, v.periode, v.tempo, v.tempo_at, v.ip, v.online ? 1 : 0, now, now, sid)
      .run()) as { meta?: { changes?: number } };
    updated += r?.meta?.changes ?? 0;
  }
  return { updated, synced_at: now };
}
