/* Cloudflare Pages Functions — /api/order-notes
   Catatan internal per order (satu order bisa banyak notes).

   Akses: semua staff login bisa baca/tambah/ubah; hapus khusus admin.
      GET    ?order_id=xxx — daftar notes satu order (baru dulu)
      GET    ?latest=1 — cuplikan 1 baris + jumlah per order
      POST   {order_id, note} — tambah (created_by = username sesi)
      PATCH  {id, note} — ubah isi
      DELETE ?id=xxx — hapus permanen (admin)
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

import { canDeleteOrder, cors, getSession } from "./_auth";

export async function onRequestOptions() {
  return new Response(null, { status: 204, headers: cors });
}

// GET /api/order-notes?order_id=xxx | ?latest=1
export async function onRequestGet({ request, env }: { request: Request; env: Env }) {
  if (!env.DB) return new Response(JSON.stringify({ error: "D1 not bound" }), { status: 500, headers: cors });
  const s = await getSession(request, env);
  if (!s) return new Response(JSON.stringify({ error: "unauthorized" }), { status: 401, headers: cors });
  const params = new URL(request.url).searchParams;
  if (params.get("latest") === "1") {
    const { results } = await env.DB.prepare(
      `SELECT n.order_id, n.note FROM order_notes n
       WHERE n.id IN (SELECT MAX(id) FROM order_notes GROUP BY order_id)`
    ).all<{ order_id: string; note: string }>();
    const counts = await env.DB.prepare(
      "SELECT order_id, COUNT(*) AS c FROM order_notes GROUP BY order_id"
    )
      .all<{ order_id: string; c: number }>()
      .catch(() => ({ results: [] as { order_id: string; c: number }[] }));
    const cc: Record<string, number> = {};
    for (const r of counts.results ?? []) cc[r.order_id] = Number(r.c);
    const snippets = (results ?? []).map((r) => ({
      order_id: r.order_id,
      snippet: String(r.note).split("\n")[0].trim().slice(0, 80),
      count: cc[r.order_id] ?? 1,
    }));
    return Response.json({ ok: true, snippets }, { headers: cors });
  }
  const order_id = (params.get("order_id") ?? "").slice(0, 64);
  if (!order_id) return new Response(JSON.stringify({ error: "order_id required" }), { status: 400, headers: cors });
  const { results } = await env.DB.prepare(
    "SELECT id, note, created_by, created_at, updated_at FROM order_notes WHERE order_id = ? ORDER BY id DESC LIMIT 200"
  )
    .bind(order_id)
    .all();
  return Response.json({ ok: true, notes: results ?? [] }, { headers: cors });
}

// POST /api/order-notes {order_id, note}
export async function onRequestPost({ request, env }: { request: Request; env: Env }) {
  if (!env.DB) return new Response(JSON.stringify({ error: "D1 not bound" }), { status: 500, headers: cors });
  const s = await getSession(request, env);
  if (!s) return new Response(JSON.stringify({ error: "unauthorized" }), { status: 401, headers: cors });
  let b: { order_id?: unknown; note?: unknown };
  try {
    b = (await request.json()) as typeof b;
  } catch {
    return new Response(JSON.stringify({ error: "invalid json" }), { status: 400, headers: cors });
  }
  const order_id = String(b.order_id ?? "").slice(0, 64);
  const note = String(b.note ?? "").trim().slice(0, 4000);
  if (!order_id) return new Response(JSON.stringify({ error: "order_id required" }), { status: 400, headers: cors });
  if (!note) return new Response(JSON.stringify({ error: "note kosong" }), { status: 400, headers: cors });
  const now = new Date().toISOString();
  const res = (await env.DB.prepare(
    "INSERT INTO order_notes (order_id, note, created_by, created_at, updated_at) VALUES (?, ?, ?, ?, ?)"
  )
    .bind(order_id, note, s.username, now, now)
    .run()) as { meta?: { last_row_id?: number } };
  return Response.json({ ok: true, id: res?.meta?.last_row_id ?? null }, { headers: cors });
}

// PATCH /api/order-notes {id, note}
export async function onRequestPatch({ request, env }: { request: Request; env: Env }) {
  if (!env.DB) return new Response(JSON.stringify({ error: "D1 not bound" }), { status: 500, headers: cors });
  const s = await getSession(request, env);
  if (!s) return new Response(JSON.stringify({ error: "unauthorized" }), { status: 401, headers: cors });
  let b: { id?: unknown; note?: unknown };
  try {
    b = (await request.json()) as typeof b;
  } catch {
    return new Response(JSON.stringify({ error: "invalid json" }), { status: 400, headers: cors });
  }
  const id = Math.round(Number(b.id));
  const note = String(b.note ?? "").trim().slice(0, 4000);
  if (!Number.isFinite(id) || id <= 0) {
    return new Response(JSON.stringify({ error: "id tidak valid" }), { status: 400, headers: cors });
  }
  if (!note) return new Response(JSON.stringify({ error: "note kosong" }), { status: 400, headers: cors });
  const res = (await env.DB.prepare("UPDATE order_notes SET note = ?, updated_at = ? WHERE id = ?")
    .bind(note, new Date().toISOString(), id)
    .run()) as { meta?: { changes?: number } };
  if (!res?.meta?.changes) {
    return new Response(JSON.stringify({ error: "not found" }), { status: 404, headers: cors });
  }
  return Response.json({ ok: true, id }, { headers: cors });
}

// DELETE /api/order-notes?id=xxx — khusus admin.
export async function onRequestDelete({ request, env }: { request: Request; env: Env }) {
  if (!env.DB) return new Response(JSON.stringify({ error: "D1 not bound" }), { status: 500, headers: cors });
  const s = await getSession(request, env);
  if (!s || !canDeleteOrder(s)) {
    return new Response(JSON.stringify({ error: "unauthorized" }), { status: 401, headers: cors });
  }
  const id = Math.round(Number(new URL(request.url).searchParams.get("id") ?? ""));
  if (!Number.isFinite(id) || id <= 0) {
    return new Response(JSON.stringify({ error: "id tidak valid" }), { status: 400, headers: cors });
  }
  const res = (await env.DB.prepare("DELETE FROM order_notes WHERE id = ?").bind(id).run()) as {
    meta?: { changes?: number };
  };
  if (!res?.meta?.changes) {
    return new Response(JSON.stringify({ error: "not found" }), { status: 404, headers: cors });
  }
  return Response.json({ ok: true, id }, { headers: cors });
}
