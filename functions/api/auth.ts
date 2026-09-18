/* Cloudflare Pages Functions — /api/auth
   Login admin passcode sederhana (stateless session, tanpa tabel tambahan).

   Setup env di Pages dashboard:
     ADMIN_PASSCODE_HASH = sha256 hex dari passcode (cth: echo -n "RAHASIA" | sha256sum)
     SESSION_SECRET      = string acak panjang (cth: openssl rand -hex 32)

   Alur: POST {passcode} -> cookie HttpOnly `malika_admin` (12 jam).
   Passcode tidak pernah dikirim ke client; yang dibandingkan hanya hash SHA-256. */

interface Env {
  ADMIN_PASSCODE_HASH?: string;
  SESSION_SECRET?: string;
}

const COOKIE = "malika_admin";
const SESSION_TTL = 12 * 3600; // detik

// Best-effort rate limit per IP (memori isolate — cukup untuk menahan brute force kasar).
const fails = new Map<string, { n: number; until: number }>();

function hex(bytes: ArrayBuffer): string {
  return [...new Uint8Array(bytes)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function sha256Hex(s: string): Promise<string> {
  return hex(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s)));
}

async function hmacHex(secret: string, msg: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  return hex(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(msg)));
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
}

async function signToken(secret: string): Promise<string> {
  const exp = Math.floor(Date.now() / 1000) + SESSION_TTL;
  const randBytes = crypto.getRandomValues(new Uint8Array(16));
  const rand = [...randBytes].map((b) => b.toString(16).padStart(2, "0")).join("");
  const body = `${exp.toString(16)}.${rand}`;
  return `${body}.${await hmacHex(secret, body)}`;
}

function getToken(req: Request): string | null {
  const cookie = req.headers.get("cookie") ?? "";
  const m = cookie.match(/(?:^|;\s*)malika_admin=([^;]+)/);
  return m ? decodeURIComponent(m[1]) : null;
}

export async function verifyAdmin(req: Request, env: Env): Promise<boolean> {
  const secret = env.SESSION_SECRET ?? "";
  if (!secret) return false;
  const tok = getToken(req);
  if (!tok) return false;
  const parts = tok.split(".");
  if (parts.length !== 3) return false;
  const [expHex, rand, sig] = parts;
  const exp = parseInt(expHex, 16);
  if (!Number.isFinite(exp) || exp < Date.now() / 1000) return false;
  if (!/^[0-9a-f]{32}$/.test(rand)) return false;
  const want = await hmacHex(secret, `${expHex}.${rand}`);
  return timingSafeEqual(want, sig.toLowerCase());
}

function sessionCookie(token: string, maxAge: number): string {
  return `${COOKIE}=${encodeURIComponent(token)}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=${maxAge}`;
}

function clientIp(req: Request): string {
  return req.headers.get("cf-connecting-ip") ?? req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
}

// POST /api/auth {passcode} — login
export async function onRequestPost({ request, env }: { request: Request; env: Env }) {
  const hash = (env.ADMIN_PASSCODE_HASH ?? "").trim().toLowerCase();
  const secret = env.SESSION_SECRET ?? "";
  if (!hash || !secret) {
    return Response.json({ error: "auth not configured" }, { status: 500 });
  }
  const ip = clientIp(request);
  const f = fails.get(ip);
  if (f && f.until > Date.now()) {
    return Response.json({ error: "Terlalu banyak percobaan. Coba lagi nanti." }, { status: 429 });
  }
  let passcode = "";
  try {
    passcode = String(((await request.json()) as { passcode?: unknown }).passcode ?? "");
  } catch {
    return Response.json({ error: "invalid json" }, { status: 400 });
  }
  const ok = passcode.length > 0 && timingSafeEqual(await sha256Hex(passcode), hash);
  if (!ok) {
    const n = (f?.n ?? 0) + 1;
    fails.set(ip, { n, until: n >= 10 ? Date.now() + 15 * 60 * 1000 : 0 });
    await new Promise((r) => setTimeout(r, Math.min(500 * n, 4000)));
    return Response.json({ error: "Passcode salah." }, { status: 401 });
  }
  fails.delete(ip);
  const token = await signToken(secret);
  return Response.json(
    { ok: true },
    { headers: { "Set-Cookie": sessionCookie(token, SESSION_TTL) } }
  );
}

// GET /api/auth — cek sesi
export async function onRequestGet({ request, env }: { request: Request; env: Env }) {
  if (!(await verifyAdmin(request, env))) {
    return Response.json({ ok: false }, { status: 401 });
  }
  return Response.json({ ok: true });
}

// DELETE /api/auth — logout
export async function onRequestDelete() {
  return Response.json(
    { ok: true },
    { headers: { "Set-Cookie": sessionCookie("expired", 0) } }
  );
}
