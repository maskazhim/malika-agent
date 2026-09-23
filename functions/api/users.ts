/* Cloudflare Pages Functions — /api/users
   Kelola akun staff (khusus admin / is_admin).
   - GET    daftar user (tanpa pass_hash)
   - POST   {username, password?, name?, division?, is_admin?} — buat baru
            (id? + field) — update; password kosong = tidak diubah
   - DELETE ?id=xxx — hapus (tidak boleh hapus diri sendiri)
*/

import {
  canManageUsers,
  cors,
  getSession,
  normDivision,
  sha256Hex,
  type EnvBase,
} from "./_auth";

interface Env extends EnvBase {}

const DIVISIONS = ["marketing", "sales", "support", "it", "ai_engineer", "retensi", "bisdev", "admin"];

export async function onRequestOptions() {
  return new Response(null, { status: 204, headers: cors });
}

// GET /api/users — khusus pengelola user.
export async function onRequestGet({ request, env }: { request: Request; env: Env }) {
  if (!env.DB) return new Response(JSON.stringify({ error: "D1 not bound" }), { status: 500, headers: cors });
  const s = await getSession(request, env);
  if (!s || !canManageUsers(s)) {
    return new Response(JSON.stringify({ error: "unauthorized" }), { status: 401, headers: cors });
  }
  const { results } = await env.DB.prepare(
    "SELECT id, username, name, division, is_admin, active, created_at FROM users ORDER BY id ASC LIMIT 200"
  ).all();
  return Response.json({ users: results ?? [], me: s.username }, { headers: cors });
}

// POST /api/users — buat / update.
export async function onRequestPost({ request, env }: { request: Request; env: Env }) {
  if (!env.DB) return new Response(JSON.stringify({ error: "D1 not bound" }), { status: 500, headers: cors });
  const s = await getSession(request, env);
  if (!s || !canManageUsers(s)) {
    return new Response(JSON.stringify({ error: "unauthorized" }), { status: 401, headers: cors });
  }
  let b: {
    id?: unknown;
    username?: unknown;
    password?: unknown;
    name?: unknown;
    division?: unknown;
    is_admin?: unknown;
    active?: unknown;
  };
  try {
    b = (await request.json()) as typeof b;
  } catch {
    return new Response(JSON.stringify({ error: "invalid json" }), { status: 400, headers: cors });
  }

  // Update user existing (id wajib).
  if (b.id !== undefined) {
    const id = Number(b.id);
    if (!id) return new Response(JSON.stringify({ error: "id tidak valid" }), { status: 400, headers: cors });
    const sets: string[] = [];
    const vals: unknown[] = [];
    if (b.name !== undefined) {
      sets.push("name = ?");
      vals.push(String(b.name).slice(0, 128));
    }
    if (b.division !== undefined) {
      const d = normDivision(b.division);
      if (!DIVISIONS.includes(d)) {
        return new Response(JSON.stringify({ error: "divisi tidak valid" }), { status: 400, headers: cors });
      }
      sets.push("division = ?");
      vals.push(d);
    }
    if (b.is_admin !== undefined) {
      if (id === s.uid && !b.is_admin) {
        return new Response(JSON.stringify({ error: "tidak bisa cabut admin diri sendiri" }), { status: 400, headers: cors });
      }
      sets.push("is_admin = ?");
      vals.push(b.is_admin ? 1 : 0);
    }
    if (b.active !== undefined) {
      if (id === s.uid && !b.active) {
        return new Response(JSON.stringify({ error: "tidak bisa nonaktifkan diri sendiri" }), { status: 400, headers: cors });
      }
      sets.push("active = ?");
      vals.push(b.active ? 1 : 0);
    }
    if (b.password !== undefined && String(b.password).length > 0) {
      if (String(b.password).length < 6) {
        return new Response(JSON.stringify({ error: "password minimal 6 karakter" }), { status: 400, headers: cors });
      }
      sets.push("pass_hash = ?");
      vals.push(await sha256Hex(String(b.password)));
    }
    if (sets.length === 0) {
      return new Response(JSON.stringify({ error: "tidak ada field diubah" }), { status: 400, headers: cors });
    }
    vals.push(id);
    const res = (await env.DB.prepare(`UPDATE users SET ${sets.join(", ")} WHERE id = ?`)
      .bind(...vals)
      .run()) as { meta?: { changes?: number } };
    if (!res?.meta?.changes) {
      return new Response(JSON.stringify({ error: "not found" }), { status: 404, headers: cors });
    }
    return Response.json({ ok: true, id }, { headers: cors });
  }

  // Buat baru.
  const username = String(b.username ?? "").trim().slice(0, 64);
  if (!/^[a-zA-Z0-9._-]{3,64}$/.test(username)) {
    return new Response(JSON.stringify({ error: "username 3-64 karakter (huruf/angka/._-)" }), { status: 400, headers: cors });
  }
  if (String(b.password ?? "").length < 6) {
    return new Response(JSON.stringify({ error: "password minimal 6 karakter" }), { status: 400, headers: cors });
  }
  const division = normDivision(b.division ?? "support");
  if (!DIVISIONS.includes(division)) {
    return new Response(JSON.stringify({ error: "divisi tidak valid" }), { status: 400, headers: cors });
  }
  try {
    const res = (await env.DB.prepare(
      `INSERT INTO users (username, pass_hash, name, division, is_admin, active, created_at)
       VALUES (?, ?, ?, ?, ?, 1, ?)`
    )
      .bind(
        username,
        await sha256Hex(String(b.password)),
        String(b.name ?? username).slice(0, 128),
        division,
        b.is_admin ? 1 : 0,
        new Date().toISOString()
      )
      .run()) as { meta?: { last_row_id?: number } };
    return Response.json({ ok: true, id: res?.meta?.last_row_id ?? 0 }, { headers: cors });
  } catch {
    return new Response(JSON.stringify({ error: "username sudah dipakai" }), { status: 409, headers: cors });
  }
}

// DELETE /api/users?id=xxx — khusus pengelola user.
export async function onRequestDelete({ request, env }: { request: Request; env: Env }) {
  if (!env.DB) return new Response(JSON.stringify({ error: "D1 not bound" }), { status: 500, headers: cors });
  const s = await getSession(request, env);
  if (!s || !canManageUsers(s)) {
    return new Response(JSON.stringify({ error: "unauthorized" }), { status: 401, headers: cors });
  }
  const id = Number(new URL(request.url).searchParams.get("id") ?? 0);
  if (!id) return new Response(JSON.stringify({ error: "id required" }), { status: 400, headers: cors });
  if (id === s.uid) {
    return new Response(JSON.stringify({ error: "tidak bisa hapus diri sendiri" }), { status: 400, headers: cors });
  }
  const res = (await env.DB.prepare("DELETE FROM users WHERE id = ?").bind(id).run()) as {
    meta?: { changes?: number };
  };
  if (!res?.meta?.changes) {
    return new Response(JSON.stringify({ error: "not found" }), { status: 404, headers: cors });
  }
  return Response.json({ ok: true, id }, { headers: cors });
}
