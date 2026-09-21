/* Cloudflare Pages Functions — GET /api/payment-logs
   Daftar log email notifikasi pembayaran (khusus admin).
   Diisi oleh worker malika-payment-watcher.
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

async function hmacHex(secret: string, msg: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(msg));
  return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
}

async function isAdmin(req: Request, env: Env): Promise<boolean> {
  const secret = env.SESSION_SECRET ?? "";
  if (!secret) return false;
  const m = (req.headers.get("cookie") ?? "").match(/(?:^|;\s*)malika_admin=([^;]+)/);
  if (!m) return false;
  const parts = decodeURIComponent(m[1]).split(".");
  if (parts.length !== 3) return false;
  const [expHex, rand, sig] = parts;
  const exp = parseInt(expHex, 16);
  if (!Number.isFinite(exp) || exp < Date.now() / 1000) return false;
  if (!/^[0-9a-f]{32}$/.test(rand)) return false;
  return timingSafeEqual(await hmacHex(secret, `${expHex}.${rand}`), sig.toLowerCase());
}

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

export async function onRequestOptions() {
  return new Response(null, { status: 204, headers: cors });
}

// GET /api/payment-logs[?action=verified|needs_review|ignored] — khusus admin.
export async function onRequestGet({ request, env }: { request: Request; env: Env }) {
  if (!env.DB) return new Response(JSON.stringify({ error: "D1 not bound" }), { status: 500, headers: cors });
  if (!(await isAdmin(request, env))) {
    return new Response(JSON.stringify({ error: "unauthorized" }), { status: 401, headers: cors });
  }
  const action = (new URL(request.url).searchParams.get("action") ?? "").slice(0, 32);
  const { results } = action
    ? await env.DB.prepare(
        "SELECT id, received_at, from_addr, subject, parsed_amounts, matched_order, action, note FROM payment_logs WHERE action = ? ORDER BY id DESC LIMIT 200"
      )
        .bind(action)
        .all()
    : await env.DB.prepare(
        "SELECT id, received_at, from_addr, subject, parsed_amounts, matched_order, action, note FROM payment_logs ORDER BY id DESC LIMIT 200"
      ).all();
  return Response.json({ logs: results ?? [] }, { headers: cors });
}
