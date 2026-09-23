/* Cloudflare Pages Functions — /api/auth
   Login staff username + password (tabel `users`).
   Sesi stateless 12 jam di cookie HttpOnly `malika_admin`
   (berisi uid + divisi, ditandatangani HMAC).
   Rate limit kasar per IP terhadap brute force.

   - POST   {username, password} -> login (200 {ok, user} / 401)
   - GET    cek sesi -> {ok, user?}
   - DELETE logout
*/

import {
  cors,
  getSession,
  normDivision,
  SESSION_TTL,
  sessionCookie,
  sha256Hex,
  signSession,
  type EnvBase,
} from "./_auth";

interface Env extends EnvBase {
  DB: EnvBase["DB"];
  SESSION_SECRET?: string;
}

// Best-effort rate limit per IP (memori isolate — cukup untuk menahan brute force kasar).
const fails = new Map<string, { n: number; until: number }>();

function clientIp(req: Request): string {
  return req.headers.get("cf-connecting-ip") ?? req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
}

export async function onRequestOptions() {
  return new Response(null, { status: 204, headers: cors });
}

// POST /api/auth {username, password} — login
export async function onRequestPost({ request, env }: { request: Request; env: Env }) {
  const secret = env.SESSION_SECRET ?? "";
  if (!secret || !env.DB) {
    return Response.json({ error: "auth not configured" }, { status: 500, headers: cors });
  }
  const ip = clientIp(request);
  const f = fails.get(ip);
  if (f && f.until > Date.now()) {
    return Response.json({ error: "Terlalu banyak percobaan. Coba lagi nanti." }, { status: 429, headers: cors });
  }
  let body: { username?: unknown; password?: unknown; passcode?: unknown };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return Response.json({ error: "invalid json" }, { status: 400, headers: cors });
  }
  // Kompatibel mundur: client lama mengirim {passcode}; abaikan bila ada username.
  const username = String(body.username ?? "").trim().slice(0, 64);
  const password = String(body.password ?? "");
  if (!username || !password) {
    return Response.json({ error: "Username dan password wajib diisi." }, { status: 400, headers: cors });
  }
  const row = await env.DB.prepare(
    "SELECT id, username, pass_hash, name, division, is_admin, active FROM users WHERE username = ?"
  )
    .bind(username)
    .first<{
      id: number;
      username: string;
      pass_hash: string;
      name: string;
      division: string;
      is_admin: number;
      active: number;
    }>()
    .catch(() => null);

  const fail = async () => {
    const n = (fails.get(ip)?.n ?? 0) + 1;
    fails.set(ip, { n, until: n >= 10 ? Date.now() + 15 * 60 * 1000 : 0 });
    await new Promise((r) => setTimeout(r, Math.min(500 * n, 4000)));
    return Response.json({ error: "Username atau password salah." }, { status: 401, headers: cors });
  };

  if (!row || !row.active) return fail();
  const t0 = Date.now();
  const ok = (await sha256Hex(password)).toLowerCase() === row.pass_hash.toLowerCase();
  // Samakan waktu respons agar enumeration user lebih sulit.
  const wait = Math.max(0, 300 - (Date.now() - t0));
  if (wait) await new Promise((r) => setTimeout(r, wait));
  if (!ok) return fail();

  fails.delete(ip);
  const session = {
    uid: row.id,
    username: row.username,
    division: normDivision(row.division),
    is_admin: row.is_admin === 1,
  };
  const token = await signSession(secret, session);
  return Response.json(
    { ok: true, user: { username: session.username, name: row.name, division: session.division, is_admin: session.is_admin } },
    { headers: { ...cors, "Set-Cookie": sessionCookie(token, SESSION_TTL) } }
  );
}

// GET /api/auth — cek sesi
export async function onRequestGet({ request, env }: { request: Request; env: Env }) {
  const s = await getSession(request, env);
  if (!s) return Response.json({ ok: false }, { status: 401, headers: cors });
  const row = await env.DB.prepare("SELECT name FROM users WHERE id = ?")
    .bind(s.uid)
    .first<{ name: string }>()
    .catch(() => null);
  return Response.json(
    { ok: true, user: { username: s.username, name: row?.name ?? s.username, division: s.division, is_admin: s.is_admin } },
    { headers: cors }
  );
}

// DELETE /api/auth — logout
export async function onRequestDelete() {
  return Response.json(
    { ok: true },
    { headers: { ...cors, "Set-Cookie": sessionCookie("expired", 0) } }
  );
}
