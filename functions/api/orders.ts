/* Cloudflare Pages Functions — /api/orders
   Menyimpan daftar order ke D1 (binding `DB`).
   Pipeline: checkout -> payment_proof -> verified -> setup_server -> onboard -> retensi
   (cabang retensi -> churn / resubscribe), plus cancelled.
   Flag greeting_done = "sudah menyapa customer baru" (paralel, pengganti onboard_done).
   Akses dibatasi sesi staff + matriks divisi (lihat _auth.ts).

   Akses:
      POST   publik   — simpan/upsert order (checkout & konfirmasi bayar)
      GET    ?order_id=xxx publik (cek satu order); tanpa param = daftar (staff,
             difilter sesuai divisi; ?status=xxx opsional)
      PATCH  staff sesuai matriks — update status / flag onboard_done
      DELETE khusus admin — hapus order permanen
*/

/* Minimal D1 types (agar lolos type-check Next tanpa @cloudflare/workers-types) */
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
  RESEND_API_KEY?: string;
  RESEND_FROM?: string;
}

import {
  canDeleteOrder,
  canSetGreeting,
  canSetOnboard,
  canTransition,
  cors,
  getSession,
  sha256Hex,
  visibleStages,
  type Session,
} from "./_auth";

interface OrderBody {
  order_id?: string;
  product?: string;
  amount?: number;
  nama?: string;
  bisnis?: string;
  telepon?: string;
  email?: string;
  method?: string;
  bukti_filename?: string;
  status?: string;
  created_at?: string;
  unique_code?: number;
  code_expires_at?: string;
  promo_code?: string;
  subdomain?: string;
  password?: string;
  password_hash?: string;
}

const LIST_COLUMNS =
  "order_id, product, amount, nama, bisnis, telepon, email, method, bukti_filename, status, created_at, unique_code, code_expires_at, promo_code, onboard_done, greeting_done, retensi_at, renewal_count, subdomain";

export async function onRequestOptions() {
  return new Response(null, { status: 204, headers: cors });
}

// GET /api/orders?order_id=xxx — cek satu order (publik).
// GET /api/orders[?status=xxx] — daftar order (staff, difilter divisi).
export async function onRequestGet({ request, env }: { request: Request; env: Env }) {
  if (!env.DB) return new Response(JSON.stringify({ error: "D1 not bound" }), { status: 500, headers: cors });
  const params = new URL(request.url).searchParams;
  const id = params.get("order_id") ?? "";
  if (id) {
    const row = await env.DB.prepare("SELECT * FROM orders WHERE order_id = ?").bind(id).first();
    if (!row) return new Response(JSON.stringify({ error: "not found" }), { status: 404, headers: cors });
    return Response.json(row, { headers: cors });
  }
  const s = await getSession(request, env);
  if (!s) {
    return new Response(JSON.stringify({ error: "unauthorized" }), { status: 401, headers: cors });
  }
  const allowed = visibleStages(s);
  const status = (params.get("status") ?? "").slice(0, 32);
  const wanted = status ? [status] : null;
  const stages = wanted ?? allowed;
  let query = `SELECT ${LIST_COLUMNS} FROM orders`;
  const vals: unknown[] = [];
  if (stages) {
    if (stages.length === 0) return Response.json({ orders: [] }, { headers: cors });
    query += ` WHERE status IN (${stages.map(() => "?").join(",")})`;
    vals.push(...stages);
  }
  query += " ORDER BY id DESC LIMIT 200";
  const { results } = await env.DB.prepare(query)
    .bind(...vals)
    .all();
  const orders = (results ?? []) as Record<string, unknown>[];
  // Enrichment best-effort: cache jatuh tempo server + assignment PIC.
  // Tabel/kolom belum ada di DB lama → catch jadi map kosong.
  let serverDue: Record<string, { tempo: string; tempo_at: string; synced_at: string }> = {};
  let assignByEmail: Record<string, Record<string, string>> = {};
  try {
    const ids = orders.map((o) => String(o.order_id ?? "")).filter(Boolean).slice(0, 200);
    if (ids.length > 0) {
      const dc = await env.DB.prepare(
        `SELECT order_id, vps_tempo, vps_tempo_at, vps_synced_at FROM deploy_configs WHERE order_id IN (${ids.map(() => "?").join(",")})`
      ).bind(...ids).all<{ order_id: string; vps_tempo: string; vps_tempo_at: string; vps_synced_at: string }>().catch(() => ({ results: [] as never[] }));
      for (const r of dc.results ?? []) {
        serverDue[r.order_id] = { tempo: r.vps_tempo ?? "", tempo_at: r.vps_tempo_at ?? "", synced_at: r.vps_synced_at ?? "" };
      }
    }
    const emails = [...new Set(orders.map((o) => String(o.email ?? "").trim().toLowerCase()).filter((e) => e.includes("@")))].slice(0, 200);
    if (emails.length > 0) {
      const as = await env.DB.prepare(
        `SELECT * FROM client_assignments WHERE email IN (${emails.map(() => "?").join(",")})`
      ).bind(...emails).all<Record<string, string>>().catch(() => ({ results: [] as never[] }));
      for (const r of as.results ?? []) {
        if (r.email) assignByEmail[String(r.email).toLowerCase()] = r;
      }
    }
  } catch {
    /* abaikan — response tetap berisi orders */
  }
  return Response.json({ orders, server_due: serverDue, assignments: assignByEmail }, { headers: cors });
}

export async function onRequestPost({ request, env }: { request: Request; env: Env }) {
  if (!env.DB) return new Response(JSON.stringify({ error: "D1 not bound" }), { status: 500, headers: cors });
  let b: OrderBody;
  try {
    b = (await request.json()) as OrderBody;
  } catch {
    return new Response(JSON.stringify({ error: "invalid json" }), { status: 400, headers: cors });
  }
  const order_id = String(b.order_id ?? "").slice(0, 64);
  if (!order_id) return new Response(JSON.stringify({ error: "order_id required" }), { status: 400, headers: cors });

  // Subdomain booking (opsional saat checkout). Normalisasi + validasi ringan;
  // clash dicek dengan mengecualikan order ini sendiri.
  const subdomain = String(b.subdomain ?? "")
    .trim()
    .toLowerCase()
    .replace(/\.malika\.ai$/i, "")
    .slice(0, 30);
  if (subdomain) {
    if (!/^[a-z0-9-]{3,30}$/.test(subdomain) || subdomain.startsWith("-") || subdomain.endsWith("-")) {
      return new Response(JSON.stringify({ error: "Subdomain tidak valid." }), { status: 400, headers: cors });
    }
    const clash = await env.DB.prepare(
      "SELECT order_id FROM orders WHERE subdomain = ? AND order_id != ? LIMIT 1"
    )
      .bind(subdomain, order_id)
      .first()
      .catch(() => null);
    if (clash) {
      return new Response(JSON.stringify({ error: "Subdomain sudah dipakai." }), { status: 409, headers: cors });
    }
  }

  // Password pilihan customer (opsional saat checkout, min. 8 karakter).
  // Disimpan sebagai hash; plain tidak pernah disimpan.
  let password_hash = String(b.password_hash ?? "").slice(0, 128);
  const plainPassword = String(b.password ?? "");
  if (plainPassword) {
    if (plainPassword.length < 8) {
      return new Response(JSON.stringify({ error: "Password minimal 8 karakter." }), { status: 400, headers: cors });
    }
    password_hash = await sha256Hex(plainPassword);
  }

  const row = {
    order_id,
    product: String(b.product ?? "-").slice(0, 64),
    amount: Number.isFinite(Number(b.amount)) ? Math.round(Number(b.amount)) : 0,
    nama: String(b.nama ?? "-").slice(0, 128),
    bisnis: String(b.bisnis ?? "-").slice(0, 128),
    telepon: String(b.telepon ?? "-").slice(0, 32),
    email: String(b.email ?? "-").slice(0, 128),
    method: String(b.method ?? "").slice(0, 16),
    bukti_filename: String(b.bukti_filename ?? "").slice(0, 256),
    status: String(b.status ?? "checkout").slice(0, 32),
    created_at: String(b.created_at ?? new Date().toISOString()).slice(0, 32),
    unique_code: Number.isFinite(Number(b.unique_code)) ? Math.round(Number(b.unique_code)) : null,
    code_expires_at: String(b.code_expires_at ?? "").slice(0, 32),
    promo_code: String(b.promo_code ?? "").trim().toUpperCase().slice(0, 32),
  };

  await env.DB.prepare(
    `INSERT INTO orders (order_id, product, amount, nama, bisnis, telepon, email, method, bukti_filename, status, created_at, unique_code, code_expires_at, promo_code, subdomain, password_hash)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(order_id) DO UPDATE SET
       product=excluded.product, amount=excluded.amount, nama=excluded.nama,
       bisnis=excluded.bisnis, telepon=excluded.telepon, email=excluded.email,
       method=excluded.method, bukti_filename=excluded.bukti_filename,
       status=excluded.status, created_at=excluded.created_at,
       unique_code=excluded.unique_code, code_expires_at=excluded.code_expires_at,
       promo_code=excluded.promo_code,
       subdomain=CASE WHEN excluded.subdomain != '' THEN excluded.subdomain ELSE orders.subdomain END,
       password_hash=CASE WHEN excluded.password_hash != '' THEN excluded.password_hash ELSE orders.password_hash END`
  )
    .bind(
      row.order_id, row.product, row.amount, row.nama, row.bisnis, row.telepon,
      row.email, row.method, row.bukti_filename, row.status, row.created_at,
      row.unique_code, row.code_expires_at, row.promo_code, subdomain, password_hash
    )
    .run();

  // Catat booking subdomain (best-effort, agar tercatat meski frontend lupa panggil /api/subdomains).
  if (subdomain) {
    await env.DB.prepare(
      `INSERT INTO subdomains (subdomain, order_id, email, status, access_url, created_at)
       VALUES (?, ?, ?, 'reserved', ?, ?)
       ON CONFLICT(subdomain) DO UPDATE SET order_id=excluded.order_id, email=excluded.email`
    )
      .bind(subdomain, order_id, row.email, `https://agent-${subdomain}.malika.ai`, new Date().toISOString())
      .run()
      .catch(() => {});
  }

  // Buat akun portal customer otomatis bila password diisi saat checkout.
  // Hanya saat password baru diberikan (tidak menimpa akun yang sudah ada).
  if (password_hash && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(row.email)) {
    await env.DB.prepare(
      `INSERT INTO customers (email, pass_hash, name, created_at)
       VALUES (?, ?, ?, ?)
       ON CONFLICT(email) DO NOTHING`
    )
      .bind(row.email.toLowerCase(), password_hash, row.nama, new Date().toISOString())
      .run()
      .catch(() => {});
  }

  // Skeleton deploy_configs saat checkout (best-effort).
  // Kolom provisioning (server_ip, ssh_*, dokploy_*, secrets_*) diisi belakangan
  // saat setup server — upsert di bawah tidak menyentuhnya.
  {
    const company = row.bisnis && row.bisnis !== "-" ? row.bisnis : row.nama;
    const serverName = `Agentic - ${company}`.slice(0, 128);
    const now = new Date().toISOString();
    const web = subdomain ? `agent-${subdomain}.malika.ai` : "";
    const connector = subdomain ? `connector-${subdomain}.malika.ai` : "";
    const router = subdomain ? `router-${subdomain}.malika.ai` : "";
    const gowa = subdomain ? `gowa-${subdomain}.malika.ai` : "";
    await env.DB.prepare(
      `INSERT INTO deploy_configs (order_id, client_name, short_name, server_name, project_name, web_domain, connector_domain, router_domain, gowa_domain, deploy_status, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?)
       ON CONFLICT(order_id) DO UPDATE SET
         client_name=excluded.client_name,
         short_name=excluded.short_name,
         server_name=excluded.server_name,
         project_name=excluded.project_name,
         web_domain=CASE WHEN excluded.web_domain != '' THEN excluded.web_domain ELSE deploy_configs.web_domain END,
         connector_domain=CASE WHEN excluded.connector_domain != '' THEN excluded.connector_domain ELSE deploy_configs.connector_domain END,
         router_domain=CASE WHEN excluded.router_domain != '' THEN excluded.router_domain ELSE deploy_configs.router_domain END,
         gowa_domain=CASE WHEN excluded.gowa_domain != '' THEN excluded.gowa_domain ELSE deploy_configs.gowa_domain END,
         updated_at=excluded.updated_at`
    )
      .bind(order_id, row.nama, subdomain, serverName, serverName, web, connector, router, gowa, now, now)
      .run()
      .catch(() => {});
  }

  return Response.json({ ok: true, order_id }, { headers: cors });
}

const KNOWN_STATUSES = [
  "checkout",
  "payment_proof",
  "verified",
  "setup_server",
  "onboard",
  "retensi",
  "churn",
  "resubscribe",
  "cancelled",
];

// PATCH /api/orders {order_id, status?, onboard_done?, greeting_done?} — staff sesuai matriks.
// Bulk: {order_ids: [...maks 100], status?} — aturan izin yang sama per order,
// hasil dilaporkan per item: {ok, results: [{order_id, ok, changed?, error?}]}.
export async function onRequestPatch({ request, env }: { request: Request; env: Env }) {
  if (!env.DB) return new Response(JSON.stringify({ error: "D1 not bound" }), { status: 500, headers: cors });
  const s: Session | null = await getSession(request, env);
  if (!s) {
    return new Response(JSON.stringify({ error: "unauthorized" }), { status: 401, headers: cors });
  }
  let b: { order_id?: unknown; order_ids?: unknown; status?: unknown; onboard_done?: unknown; greeting_done?: unknown };
  try {
    b = (await request.json()) as typeof b;
  } catch {
    return new Response(JSON.stringify({ error: "invalid json" }), { status: 400, headers: cors });
  }
  const greetingVal = b.greeting_done !== undefined ? b.greeting_done : b.onboard_done;
  const status = b.status !== undefined ? String(b.status) : "";

  // Mode bulk: array order_ids.
  if (b.order_ids !== undefined) {
    const ids = (Array.isArray(b.order_ids) ? b.order_ids : [])
      .map((v) => String(v ?? "").slice(0, 64))
      .filter(Boolean)
      .slice(0, 100);
    if (ids.length === 0) return new Response(JSON.stringify({ error: "order_ids required" }), { status: 400, headers: cors });
    // Bulk hanya untuk pindah status (flag greeting tetap satuan via UI).
    if (!status) return new Response(JSON.stringify({ error: "status required untuk bulk" }), { status: 400, headers: cors });
    if (!KNOWN_STATUSES.includes(status)) {
      return new Response(JSON.stringify({ error: "status tidak valid" }), { status: 400, headers: cors });
    }
    const results = [];
    for (const id of new Set(ids)) {
      try {
        const changed = await patchOneOrder(env, s, id, status, undefined);
        results.push({ order_id: id, ok: true, changed });
      } catch (e) {
        const err = e as { status?: number; error?: string };
        results.push({ order_id: id, ok: false, error: err?.error ?? "gagal" });
      }
    }
    const updated = results.filter((r) => r.ok).length;
    return Response.json({ ok: true, updated, failed: results.length - updated, results }, { headers: cors });
  }

  const order_id = String(b.order_id ?? "").slice(0, 64);
  if (!order_id) return new Response(JSON.stringify({ error: "order_id required" }), { status: 400, headers: cors });

  try {
    const changed = await patchOneOrder(env, s, order_id, status, greetingVal);
    return Response.json({ ok: true, order_id, changed }, { headers: cors });
  } catch (e) {
    const err = e as { status?: number; error?: string };
    return new Response(JSON.stringify({ error: err?.error ?? "gagal" }), { status: err?.status ?? 400, headers: cors });
  }
}

/* Satu order di-patch (dipakai mode satuan & bulk).
   Throw {status, error} bila gagal — caller yang menerjemahkan ke respons. */
async function patchOneOrder(
  env: Env,
  s: Session,
  order_id: string,
  status: string,
  greetingVal: unknown
): Promise<string[]> {

  // Ambil status + promo lama dulu (untuk guard transisi & hitung used_count tepat sekali).
  const before = await env.DB.prepare(
    "SELECT status, promo_code, retensi_at FROM orders WHERE order_id = ?"
  )
    .bind(order_id)
    .first<{ status: string; promo_code: string; retensi_at: string }>();
  if (!before) throw { status: 404, error: "not found" };

  const changed: string[] = [];

  // 1) Flag greeting paralel ("sudah menyapa customer baru").
  //    onboard_done diterima sebagai alias lama demi kompatibilitas UI lama.
  if (greetingVal !== undefined) {
    if (!canSetGreeting(s) && !canSetOnboard(s)) {
      throw { status: 403, error: "forbidden" };
    }
    const v = greetingVal ? 1 : 0;
    await env.DB.prepare("UPDATE orders SET greeting_done = ?, onboard_done = ? WHERE order_id = ?")
      .bind(v, v, order_id)
      .run();
    changed.push("greeting_done");
  }

  // 2) Pindah status pipeline.
  if (status) {
    if (!KNOWN_STATUSES.includes(status)) {
      throw { status: 400, error: "status tidak valid" };
    }
    if (status !== before.status && !canTransition(s, before.status, status)) {
      throw { status: 403, error: "forbidden untuk divisimu" };
    }
    if (status !== before.status) {
      // Order final (verified/cancelled) langsung membebaskan kode uniknya
      // agar bisa dipakai ulang oleh order lain.
      const freeCode = status === "verified" || status === "cancelled";
      const nowIso = new Date().toISOString();
      if (status === "resubscribe") {
        // Perpanjang: +1 hitungan, masa aktif 30 hari dihitung ulang dari sekarang.
        await env.DB.prepare(
          "UPDATE orders SET status = ?, renewal_count = renewal_count + 1, retensi_at = ? WHERE order_id = ?"
        )
          .bind(status, nowIso, order_id)
          .run();
      } else if (status === "retensi" && !before.retensi_at) {
        await env.DB.prepare("UPDATE orders SET status = ?, retensi_at = ? WHERE order_id = ?")
          .bind(status, nowIso, order_id)
          .run();
      } else if (freeCode) {
        await env.DB.prepare(
          "UPDATE orders SET status = ?, unique_code = NULL, code_expires_at = '' WHERE order_id = ?"
        )
          .bind(status, order_id)
          .run();
      } else {
        await env.DB.prepare("UPDATE orders SET status = ? WHERE order_id = ?")
          .bind(status, order_id)
          .run();
      }
      changed.push("status");
    }
  }

  if (changed.length === 0) {
    throw { status: 400, error: "tidak ada perubahan" };
  }

  // Order baru saja verified -> kirim email konfirmasi pembayaran (best-effort).
  if (changed.includes("status") && status === "verified" && before.status !== "verified") {
    // Promo terpakai tepat sekali (transisi ke verified pertama kali).
    // Kode affiliate dicatat ke affiliate_referrals (komisi payable), bukan ke promos.
    if (before.promo_code) {
      const aff = await env.DB.prepare(
        "SELECT code, discount_percent, commission_percent FROM affiliate_codes WHERE code = ? AND active = 1"
      )
        .bind(before.promo_code)
        .first<{ code: string; discount_percent: number; commission_percent: number }>()
        .catch(() => null);
      if (aff) {
        const paidRow = await env.DB.prepare("SELECT amount FROM orders WHERE order_id = ?")
          .bind(order_id)
          .first<{ amount: number }>()
          .catch(() => null);
        const finalAmount = Math.max(0, Math.round(Number(paidRow?.amount ?? 0)));
        const d = Math.max(0, Math.min(100, Math.round(aff.discount_percent)));
        const k = Math.max(0, Math.min(100, Math.round(aff.commission_percent)));
        const commission = Math.round((finalAmount * k) / 100);
        // Rekonstruksi diskon dari nominal akhir (diskon % dari harga dasar).
        const discountAmt = d >= 100 ? finalAmount : Math.round((finalAmount * d) / Math.max(1, 100 - d));
        const dup = await env.DB.prepare("SELECT id FROM affiliate_referrals WHERE order_id = ?")
          .bind(order_id)
          .first()
          .catch(() => null);
        if (!dup) {
          await env.DB.prepare(
            `INSERT INTO affiliate_referrals (code, order_id, discount_amount, commission_amount, status, created_at)
             VALUES (?, ?, ?, ?, 'payable', ?)`
          )
            .bind(aff.code, order_id, discountAmt, commission, new Date().toISOString())
            .run()
            .catch(() => {});
        }
      } else {
        await env.DB.prepare("UPDATE promos SET used_count = used_count + 1 WHERE code = ?")
          .bind(before.promo_code)
          .run()
          .catch(() => {});
      }
    }
    try {
      const order = await env.DB.prepare(
        "SELECT order_id, product, amount, nama, email FROM orders WHERE order_id = ?"
      )
        .bind(order_id)
        .first<{ order_id: string; product: string; amount: number; nama: string; email: string }>();
      if (order && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(order.email)) {
        const { paymentConfirmedMail, sendMail } = await import("./_email");
        const mail = await sendMail(env, {
          to: order.email,
          ...paymentConfirmedMail({
            nama: order.nama,
            product: order.product,
            amount: order.amount,
            order_id: order.order_id,
          }),
        });
        console.log(`[orders] email verified ke ${order.email}: ${mail.ok ? "sent" : mail.error}`);
      }
    } catch (e) {
      console.log(`[orders] email verified gagal: ${String(e).slice(0, 200)}`);
    }
  }

  // Order pindah setup_server -> onboard: setup selesai → kirim URL akses agent
  // otomatis (tanpa credential; customer signup sendiri). Best-effort.
  if (changed.includes("status") && status === "onboard" && before.status === "setup_server") {
    try {
      const order = await env.DB.prepare(
        "SELECT order_id, nama, email, subdomain FROM orders WHERE order_id = ?"
      )
        .bind(order_id)
        .first<{ order_id: string; nama: string; email: string; subdomain: string }>();
      const dep = await env.DB.prepare(
        "SELECT short_name, web_domain FROM deploy_configs WHERE order_id = ?"
      )
        .bind(order_id)
        .first<{ short_name: string; web_domain: string }>()
        .catch(() => null);
      const base = (dep?.short_name || order?.subdomain || "").trim().toLowerCase();
      const host = String(dep?.web_domain ?? "")
        .trim()
        .toLowerCase()
        .replace(/^https?:\/\//, "")
        .replace(/\/+$/, "");
      const access_url = host.includes(".")
        ? `https://${host}`
        : base
          ? `https://agent-${base}.malika.ai`
          : "";
      if (order && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(order.email) && access_url) {
        const { agentAccessMail, fetchOnboardingPdf, sendMail } = await import("./_email");
        const pdf = await fetchOnboardingPdf();
        const mail = await sendMail(env, {
          to: order.email,
          ...agentAccessMail({ client_name: order.nama, access_url }),
          attachments: pdf ? [pdf] : [],
        });
        console.log(`[orders] email akses agent ke ${order.email}: ${mail.ok ? "sent" : mail.error}`);
      } else {
        console.log(`[orders] email akses agent dilewati untuk ${order_id} (email/url tak lengkap)`);
      }
    } catch (e) {
      console.log(`[orders] email akses agent gagal: ${String(e).slice(0, 200)}`);
    }
  }
  // Order masuk setup_server: pastikan assignment PIC per customer email ada.
  // AI engineer dirotasi by load bila kosong; divisi lain diisi single-person.
  // Best-effort — kegagalan assign tidak menggagalkan pindah status.
  if (changed.includes("status") && status === "setup_server") {
    try {
      await ensureAssignment(env, order_id, s.username);
    } catch (e) {
      console.log(`[orders] auto-assign ${order_id} dilewati: ${String(e).slice(0, 200)}`);
    }
  }
  return changed;
}

/* Assignment PIC per customer email (auto saat masuk setup_server).
   - Baris dibuat bila belum ada; divisi single-person diisi user aktif pertama.
   - ai_engineer kosong → user ai_engineer aktif dengan load (COUNT) terkecil. */
async function ensureAssignment(env: Env, order_id: string, by: string): Promise<void> {
  const ord = await env.DB.prepare("SELECT email FROM orders WHERE order_id = ?")
    .bind(order_id)
    .first<{ email: string }>()
    .catch(() => null);
  const email = String(ord?.email ?? "").trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return;
  await env.DB.prepare(
    `CREATE TABLE IF NOT EXISTS client_assignments (
      email TEXT PRIMARY KEY, sales TEXT NOT NULL DEFAULT '', marketing TEXT NOT NULL DEFAULT '',
      support TEXT NOT NULL DEFAULT '', it TEXT NOT NULL DEFAULT '',
      ai_engineer TEXT NOT NULL DEFAULT '', retensi TEXT NOT NULL DEFAULT '',
      updated_at TEXT NOT NULL DEFAULT '', updated_by TEXT NOT NULL DEFAULT '')`
  ).run().catch(() => {});
  const cur = await env.DB.prepare("SELECT * FROM client_assignments WHERE email = ?")
    .bind(email).first<Record<string, string>>().catch(() => null);
  if (cur && String(cur.ai_engineer ?? "").trim()) return; // sudah ada PIC AI — jangan ganggu
  const now = new Date().toISOString();
  // Default single-person: user aktif pertama per divisi.
  async function firstActive(division: string): Promise<string> {
    const r = await env.DB.prepare("SELECT username FROM users WHERE division = ? AND active = 1 ORDER BY id ASC LIMIT 1")
      .bind(division).first<{ username: string }>().catch(() => null);
    return r?.username ?? "";
  }
  // AI engineer dengan load terkecil.
  async function leastLoadedAi(): Promise<string> {
    const cands = await env.DB.prepare("SELECT username FROM users WHERE division = 'ai_engineer' AND active = 1 ORDER BY id ASC LIMIT 50")
      .all<{ username: string }>().catch(() => ({ results: [] as never[] }));
    const list = (cands.results ?? []).map((r) => r.username).filter(Boolean);
    if (list.length === 0) return "";
    if (list.length === 1) return list[0];
    const loads = await env.DB.prepare(
      `SELECT ai_engineer AS pic, COUNT(*) AS n FROM client_assignments WHERE ai_engineer IN (${list.map(() => "?").join(",")}) GROUP BY ai_engineer`
    ).bind(...list).all<{ pic: string; n: number }>().catch(() => ({ results: [] as never[] }));
    const n: Record<string, number> = {};
    for (const r of loads.results ?? []) n[r.pic] = Number(r.n ?? 0);
    let best = list[0];
    for (const u of list) if ((n[u] ?? 0) < (n[best] ?? 0)) best = u;
    return best;
  }
  const patch: Record<string, string> = {};
  if (!cur) {
    for (const d of ["sales", "marketing", "support", "it", "retensi"]) patch[d] = await firstActive(d);
    patch.ai_engineer = await leastLoadedAi();
    const cols = Object.keys(patch);
    if (cols.length === 0) return;
    await env.DB.prepare(
      `INSERT INTO client_assignments (email, ${cols.join(", ")}, updated_at, updated_by)
       VALUES (?, ${cols.map(() => "?").join(", ")}, ?, ?)
       ON CONFLICT(email) DO NOTHING`
    ).bind(email, ...cols.map((c) => patch[c]), now, by).run();
  } else {
    if (!String(cur.ai_engineer ?? "").trim()) {
      const ai = await leastLoadedAi();
      if (ai) {
        await env.DB.prepare("UPDATE client_assignments SET ai_engineer = ?, updated_at = ?, updated_by = ? WHERE email = ?")
          .bind(ai, now, by, email).run();
      }
    }
  }
}

// DELETE /api/orders?order_id=xxx — khusus admin (hapus order permanen).
// Bulk: ?order_ids=a,b,c (maks 100) atau body JSON {order_ids: [...]}.
// Baris yang dihapus otomatis membebaskan kode uniknya.
export async function onRequestDelete({ request, env }: { request: Request; env: Env }) {
  if (!env.DB) return new Response(JSON.stringify({ error: "D1 not bound" }), { status: 500, headers: cors });
  const s = await getSession(request, env);
  if (!s || !canDeleteOrder(s)) {
    return new Response(JSON.stringify({ error: "unauthorized" }), { status: 401, headers: cors });
  }
  const params = new URL(request.url).searchParams;
  const order_id = (params.get("order_id") ?? "").slice(0, 64);

  // Mode bulk: query ?order_ids=a,b,c atau body JSON {order_ids: [...]}.
  let bulkIds: string[] = (params.get("order_ids") ?? "")
    .split(",")
    .map((v) => v.trim().slice(0, 64))
    .filter(Boolean);
  if (bulkIds.length === 0 && !order_id) {
    try {
      const b = (await request.json()) as { order_ids?: unknown };
      if (Array.isArray(b?.order_ids)) {
        bulkIds = b.order_ids.map((v) => String(v ?? "").slice(0, 64)).filter(Boolean);
      }
    } catch {
      /* abaikan — ditangani validasi di bawah */
    }
  }
  if (bulkIds.length > 0) {
    const ids = [...new Set(bulkIds)].slice(0, 100);
    const deleted: string[] = [];
    const not_found: string[] = [];
    for (const id of ids) {
      const res = (await env.DB.prepare("DELETE FROM orders WHERE order_id = ?")
        .bind(id)
        .run()) as { meta?: { changes?: number } };
      (res?.meta?.changes ? deleted : not_found).push(id);
    }
    return Response.json({ ok: true, deleted, not_found }, { headers: cors });
  }

  if (!order_id) {
    return new Response(JSON.stringify({ error: "order_id required" }), { status: 400, headers: cors });
  }
  const res = (await env.DB.prepare("DELETE FROM orders WHERE order_id = ?")
    .bind(order_id)
    .run()) as { meta?: { changes?: number } };
  if (!res?.meta?.changes) {
    return new Response(JSON.stringify({ error: "not found" }), { status: 404, headers: cors });
  }
  return Response.json({ ok: true, order_id }, { headers: cors });
}
