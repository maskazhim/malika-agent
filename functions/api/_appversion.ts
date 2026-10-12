/* Satu-satunya flow cek versi aplikasi client (dipakai Tab Server + cron harian).
   File underscore = tidak jadi route, hanya untuk diimpor.
   GET https://<web_domain>/api/version -> {tag, revision}; disimpan ke
   deploy_configs (app_tag / app_revision / app_version_at) per order_id.
*/

export interface AppVersion {
  tag: string;
  revision: string;
  at: string;
}

/* Fetch versi satu domain. Throw bila gagal/timeout. Caller atur timeout global. */
async function fetchOne(domain: string, signal: AbortSignal): Promise<{ tag: string; revision: string }> {
  const host = domain
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//i, "")
    .split("/")[0];
  if (!host || !/^[a-z0-9.-]+\.[a-z]{2,}$/.test(host)) throw new Error("domain tidak valid");
  const res = await fetch(`https://${host}/api/version`, { signal });
  if (!res.ok) throw new Error(`version ${res.status}`);
  const j = (await res.json()) as { tag?: unknown; revision?: unknown };
  const tag = String(j.tag ?? "").slice(0, 32);
  if (!tag) throw new Error("tag kosong");
  return { tag, revision: String(j.revision ?? "").slice(0, 64) };
}

interface D1Prepared {
  bind(...values: unknown[]): D1Prepared;
  first<T = Record<string, unknown>>(): Promise<T | null>;
  all<T = Record<string, unknown>>(): Promise<{ results: T[] }>;
  run(): Promise<unknown>;
}
export interface D1Database {
  prepare(query: string): D1Prepared;
}

/* Ambil daftar order yang punya web_domain. */
export async function listVersionTargets(
  db: D1Database
): Promise<{ order_id: string; web_domain: string }[]> {
  const { results } = await db
    .prepare("SELECT order_id, web_domain FROM deploy_configs WHERE web_domain != '' LIMIT 500")
    .all<{ order_id: string; web_domain: string }>();
  return (results ?? []).map((r) => ({ order_id: r.order_id, web_domain: r.web_domain }));
}

/* Fetch paralel semua target (10 dtk per domain). Return map order_id => versi. */
export async function fetchVersions(
  targets: { order_id: string; web_domain: string }[]
): Promise<Record<string, AppVersion>> {
  const out: Record<string, AppVersion> = {};
  await Promise.all(
    targets.map(async (t) => {
      const ctl = new AbortController();
      const timer = setTimeout(() => ctl.abort(), 10000);
      try {
        const v = await fetchOne(t.web_domain, ctl.signal);
        out[t.order_id] = { ...v, at: new Date().toISOString() };
      } catch {
        /* satu domain gagal = lewati, lainnya tetap jalan */
      } finally {
        clearTimeout(timer);
      }
    })
  );
  return out;
}

/* Simpan hasil ke deploy_configs (WHERE order_id). Return jumlah baris. */
export async function persistVersionCache(
  db: D1Database,
  versions: Record<string, AppVersion>
): Promise<{ updated: number; synced_at: string }> {
  const now = new Date().toISOString();
  let updated = 0;
  for (const [order_id, v] of Object.entries(versions)) {
    const r = (await db
      .prepare(
        "UPDATE deploy_configs SET app_tag = ?, app_revision = ?, app_version_at = ?, updated_at = ? WHERE order_id = ?"
      )
      .bind(v.tag, v.revision, now, now, order_id)
      .run()) as { meta?: { changes?: number } };
    updated += r?.meta?.changes ?? 0;
  }
  return { updated, synced_at: now };
}
