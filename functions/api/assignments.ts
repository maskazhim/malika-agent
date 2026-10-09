/* Cloudflare Pages Functions — /api/assignments
   Assignment PIC staff per customer email (satu baris per email lowercase).

   - GET — daftar assignments + daftar user aktif per divisi + load AI engineer.
     Query opsional: ?email=xxx (satu baris), ?search=xxx (filter email/pic).
     Akses: semua staff login (untuk tampil "PIC saya"); ubah tetap dibatasi.
   - POST {email, sales?, marketing?, support?, it?, ai_engineer?, retensi?}
     — assign / pindah assign. Akses: admin / bisdev (lihat canAssignStaff).
     Field kosong ("") = kosongkan; field absen = tidak diubah.
     Username tujuan harus user aktif (atau "" untuk kosongkan).
*/

import { canAssignStaff, cors, getSession, normDivision, type EnvBase } from "./_auth";

interface Env extends EnvBase {}

const DIVISIONS = ["sales", "marketing", "support", "it", "ai_engineer", "retensi"] as const;

export async function onRequestOptions() {
  return new Response(null, { status: 204, headers: cors });
}

// GET /api/assignments[?email=..][?search=..]
export async function onRequestGet({ request, env }: { request: Request; env: Env }) {
  if (!env.DB) return new Response(JSON.stringify({ error: "D1 not bound" }), { status: 500, headers: cors });
  const s = await getSession(request, env);
  if (!s) return new Response(JSON.stringify({ error: "unauthorized" }), { status: 401, headers: cors });
  const params = new URL(request.url).searchParams;
  const email = params.get("email")?.trim().toLowerCase().slice(0, 128) ?? "";
  const search = params.get("search")?.trim().toLowerCase().slice(0, 128) ?? "";

  // Pastikan tabel ada (D1 lama sebelum migrasi 0022).
  await env.DB.prepare(
    `CREATE TABLE IF NOT EXISTS client_assignments (
      email TEXT PRIMARY KEY, sales TEXT NOT NULL DEFAULT '', marketing TEXT NOT NULL DEFAULT '',
      support TEXT NOT NULL DEFAULT '', it TEXT NOT NULL DEFAULT '',
      ai_engineer TEXT NOT NULL DEFAULT '', retensi TEXT NOT NULL DEFAULT '',
      updated_at TEXT NOT NULL DEFAULT '', updated_by TEXT NOT NULL DEFAULT '')`
  ).run().catch(() => {});

  if (email) {
    const row = await env.DB.prepare("SELECT * FROM client_assignments WHERE email = ?")
      .bind(email).first().catch(() => null);
    return Response.json({ ok: true, assignment: row ?? null }, { headers: cors });
  }

  let query = "SELECT * FROM client_assignments";
  const vals: unknown[] = [];
  if (search) {
    query += " WHERE lower(email) LIKE ? OR lower(sales) LIKE ? OR lower(marketing) LIKE ? OR lower(support) LIKE ? OR lower(it) LIKE ? OR lower(ai_engineer) LIKE ? OR lower(retensi) LIKE ?";
    const like = `%${search}%`;
    vals.push(like, like, like, like, like, like, like);
  }
  query += " ORDER BY email ASC LIMIT 500";
  const { results } = await env.DB.prepare(query).bind(...vals).all().catch(() => ({ results: [] as never[] }));

  // User aktif per divisi (untuk dropdown) + load AI engineer (jumlah klien).
  const users = await env.DB.prepare(
    "SELECT username, name, division FROM users WHERE active = 1 ORDER BY name ASC LIMIT 500"
  ).all<{ username: string; name: string; division: string }>().catch(() => ({ results: [] as never[] }));
  const byDivision: Record<string, { username: string; name: string }[]> = {};
  for (const u of users.results ?? []) {
    const d = normDivision(u.division);
    if (!DIVISIONS.includes(d as (typeof DIVISIONS)[number])) continue;
    (byDivision[d] ??= []).push({ username: u.username, name: u.name });
  }
  const loads: Record<string, number> = {};
  const loadRows = await env.DB.prepare(
    "SELECT ai_engineer AS pic, COUNT(*) AS n FROM client_assignments WHERE ai_engineer != '' GROUP BY ai_engineer"
  ).all<{ pic: string; n: number }>().catch(() => ({ results: [] as never[] }));
  for (const r of loadRows.results ?? []) loads[r.pic] = Number(r.n ?? 0);

  return Response.json(
    { ok: true, assignments: results ?? [], staff: byDivision, ai_loads: loads, can_assign: canAssignStaff(s) },
    { headers: cors }
  );
}

// POST /api/assignments — admin / bisdev saja.
export async function onRequestPost({ request, env }: { request: Request; env: Env }) {
  if (!env.DB) return new Response(JSON.stringify({ error: "D1 not bound" }), { status: 500, headers: cors });
  const s = await getSession(request, env);
  if (!s) return new Response(JSON.stringify({ error: "unauthorized" }), { status: 401, headers: cors });
  if (!canAssignStaff(s)) return new Response(JSON.stringify({ error: "forbidden" }), { status: 403, headers: cors });

  let b: Record<string, unknown>;
  try {
    b = (await request.json()) as Record<string, unknown>;
  } catch {
    return new Response(JSON.stringify({ error: "invalid json" }), { status: 400, headers: cors });
  }
  const email = String(b.email ?? "").trim().toLowerCase().slice(0, 128);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return new Response(JSON.stringify({ error: "email tidak valid" }), { status: 400, headers: cors });
  }
  await env.DB.prepare(
    `CREATE TABLE IF NOT EXISTS client_assignments (
      email TEXT PRIMARY KEY, sales TEXT NOT NULL DEFAULT '', marketing TEXT NOT NULL DEFAULT '',
      support TEXT NOT NULL DEFAULT '', it TEXT NOT NULL DEFAULT '',
      ai_engineer TEXT NOT NULL DEFAULT '', retensi TEXT NOT NULL DEFAULT '',
      updated_at TEXT NOT NULL DEFAULT '', updated_by TEXT NOT NULL DEFAULT '')`
  ).run().catch(() => {});

  // Validasi username tujuan (harus user aktif divisi tsb, atau "" untuk kosongkan).
  const sets: string[] = [];
  const vals: unknown[] = [];
  for (const d of DIVISIONS) {
    if (b[d] === undefined) continue;
    const u = String(b[d] ?? "").trim().slice(0, 64);
    if (u) {
      const row = await env.DB.prepare("SELECT division, active FROM users WHERE username = ?")
        .bind(u).first<{ division: string; active: number }>().catch(() => null);
      if (!row || !row.active) {
        return new Response(JSON.stringify({ error: `user ${u} tidak aktif` }), { status: 400, headers: cors });
      }
      if (normDivision(row.division) !== d) {
        return new Response(JSON.stringify({ error: `${u} bukan divisi ${d}` }), { status: 400, headers: cors });
      }
    }
    sets.push(`${d} = ?`);
    vals.push(u);
  }
  if (sets.length === 0) {
    return new Response(JSON.stringify({ error: "tidak ada field diubah" }), { status: 400, headers: cors });
  }
  const now = new Date().toISOString();
  await env.DB.prepare(
    `INSERT INTO client_assignments (email, ${sets.map((x) => x.split(" ")[0]).join(", ")}, updated_at, updated_by)
     VALUES (?, ${sets.map(() => "?").join(", ")}, ?, ?)
     ON CONFLICT(email) DO UPDATE SET ${sets.join(", ")}, updated_at=excluded.updated_at, updated_by=excluded.updated_by`
  ).bind(email, ...vals, now, s.username).run();

  const row = await env.DB.prepare("SELECT * FROM client_assignments WHERE email = ?")
    .bind(email).first().catch(() => null);
  return Response.json({ ok: true, assignment: row }, { headers: cors });
}
