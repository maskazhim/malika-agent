/* Cloudflare Pages Functions — /api/pricing
   Katalog harga paket langganan (D1).
   - GET   publik — daftar paket (dipakai halaman #harga + fallback aman)
   - PATCH khusus admin — ubah harga/deskripsi/fitur/cta/popular per paket
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
  "Access-Control-Allow-Methods": "GET, PATCH, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

const VALID_KEYS = ["starter", "growth", "scale"];

export async function onRequestOptions() {
  return new Response(null, { status: 204, headers: cors });
}

// GET /api/pricing — publik.
export async function onRequestGet({ env }: { env: Env }) {
  if (!env.DB) return new Response(JSON.stringify({ error: "D1 not bound" }), { status: 500, headers: cors });
  const { results } = await env.DB.prepare(
    "SELECT key, name, price, period, description, features, cta, popular FROM pricing ORDER BY price ASC"
  ).all<{
    key: string;
    name: string;
    price: number;
    period: string;
    description: string;
    features: string;
    cta: string;
    popular: number;
  }>();
  const plans = (results ?? []).map((r) => {
    let features: string[] = [];
    try {
      const parsed: unknown = JSON.parse(r.features);
      if (Array.isArray(parsed)) features = parsed.map(String);
    } catch {
      /* biarkan kosong */
    }
    return { ...r, features, popular: r.popular === 1 };
  });
  return Response.json({ plans }, { headers: cors });
}

// PATCH /api/pricing {key, price?, description?, features?, cta?, popular?} — admin.
export async function onRequestPatch({ request, env }: { request: Request; env: Env }) {
  if (!env.DB) return new Response(JSON.stringify({ error: "D1 not bound" }), { status: 500, headers: cors });
  if (!(await isAdmin(request, env))) {
    return new Response(JSON.stringify({ error: "unauthorized" }), { status: 401, headers: cors });
  }
  let b: {
    key?: unknown;
    price?: unknown;
    description?: unknown;
    features?: unknown;
    cta?: unknown;
    popular?: unknown;
  };
  try {
    b = (await request.json()) as typeof b;
  } catch {
    return new Response(JSON.stringify({ error: "invalid json" }), { status: 400, headers: cors });
  }
  const key = String(b.key ?? "").toLowerCase();
  if (!VALID_KEYS.includes(key)) {
    return new Response(JSON.stringify({ error: "key tidak valid" }), { status: 400, headers: cors });
  }
  const sets: string[] = [];
  const vals: unknown[] = [];
  if (b.price !== undefined) {
    const price = Math.round(Number(b.price));
    if (!Number.isFinite(price) || price <= 0) {
      return new Response(JSON.stringify({ error: "price harus angka > 0" }), { status: 400, headers: cors });
    }
    sets.push("price = ?");
    vals.push(price);
  }
  if (b.description !== undefined) {
    sets.push("description = ?");
    vals.push(String(b.description).slice(0, 500));
  }
  if (b.features !== undefined) {
    if (!Array.isArray(b.features)) {
      return new Response(JSON.stringify({ error: "features harus array string" }), { status: 400, headers: cors });
    }
    sets.push("features = ?");
    vals.push(JSON.stringify(b.features.map((f) => String(f).slice(0, 200)).filter(Boolean)));
  }
  if (b.cta !== undefined) {
    sets.push("cta = ?");
    vals.push(String(b.cta).slice(0, 64));
  }
  if (b.popular !== undefined) {
    sets.push("popular = ?");
    vals.push(b.popular ? 1 : 0);
  }
  if (sets.length === 0) {
    return new Response(JSON.stringify({ error: "tidak ada field diubah" }), { status: 400, headers: cors });
  }
  vals.push(key);
  const res = (await env.DB.prepare(`UPDATE pricing SET ${sets.join(", ")} WHERE key = ?`)
    .bind(...vals)
    .run()) as { meta?: { changes?: number } };
  if (!res?.meta?.changes) {
    return new Response(JSON.stringify({ error: "not found" }), { status: 404, headers: cors });
  }
  return Response.json({ ok: true, key }, { headers: cors });
}
