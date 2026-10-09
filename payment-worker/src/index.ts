/* malika-payment-watcher — Cloudflare Email Worker.
   Alur: notifikasi pembayaran masuk ke Gmail user -> user forward ke
   alamat Email Routing (mis. bayar@malika.ai) -> diteruskan ke worker ini ->
   worker parse nominal -> cocokkan order aktif -> update status verified.

   Aturan verifikasi otomatis (konservatif):
   - Hanya order QRIS (punya unique_code) yang boleh auto-verified by amount,
     karena totalnya unik (harga + kode 1-999).
   - Order transfer (tanpa kode unik) nominalnya bisa kembar antar order,
     jadi SELALU needs_review (verifikasi manual via bukti WA).
   - Email tanpa nominal / tanpa order cocok -> logged sebagai ignored /
     needs_review, tidak mengubah apa pun.
*/

import PostalMime from "postal-mime";

/* --- Minimal Cloudflare types (tanpa @cloudflare/workers-types) --- */
interface D1Prepared {
  bind(...values: unknown[]): D1Prepared;
  first<T = Record<string, unknown>>(): Promise<T | null>;
  all<T = Record<string, unknown>>(): Promise<{ results: T[] }>;
  run(): Promise<unknown>;
}
interface D1Database {
  prepare(query: string): D1Prepared;
}
interface InboundEmail {
  readonly from: string;
  readonly to: string;
  readonly raw: ReadableStream<Uint8Array>;
  setReject(reason: string): void;
}
interface Env {
  DB: D1Database;
  RESEND_API_KEY?: string;
  RESEND_FROM?: string;
  INDOVM_LOOKUP_TOKEN?: string;
  INDOVM_LOOKUP_URL?: string;
}

const ACTIVE_STATUSES = ["checkout", "payment_proof"];
// Batas bawah longgar selama fase testing (transfer Rp1.000 ikut diproses).
const MIN_AMOUNT = 500;
const MAX_AMOUNT = 999_999_999;

function stripHtml(html: string): string {
  return html
    .replace(/<(script|style)[^>]*>[\s\S]*?<\/\1>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\s+/g, " ");
}

/* Ambil semua kandidat nominal (integer rupiah) dari teks email. */
export function extractAmounts(text: string): number[] {
  const found = new Set<number>();
  const patterns = [
    /Rp\s?([\d.]+(?:,\d{1,2})?)/gi,
    /\bIDR\s?([\d.,]+)/gi,
    /(?:nominal|jumlah|total|sebesar|senilai|amount)\s*(?:Rp\s?)?[:=]?\s*([\d.]+(?:,\d{1,2})?)/gi,
  ];
  for (const re of patterns) {
    re.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = re.exec(text)) !== null) {
      const raw = m[1].replace(/\s/g, "");
      const intPart = raw.split(",")[0].replace(/\./g, "");
      const n = parseInt(intPart, 10);
      if (Number.isFinite(n) && n >= MIN_AMOUNT && n <= MAX_AMOUNT) found.add(n);
    }
  }
  return [...found].sort((a, b) => b - a);
}

interface ActiveOrder {
  order_id: string;
  product: string;
  nama: string;
  email: string;
  amount: number;
  method: string;
  unique_code: number | null;
  promo_code: string;
}

const DEFAULT_FROM = "Malika Agent <noreply@malikaagent.my.id>";

function fmtRp(n: number): string {
  return "Rp" + Number(n).toLocaleString("id-ID");
}

/* Email konfirmasi pembayaran via Resend (best-effort, gagal kirim tidak
   menggagalkan verifikasi). API key dari secret worker RESEND_API_KEY. */
async function sendPaymentConfirmedMail(
  env: Env,
  o: { nama: string; product: string; amount: number; order_id: string; email: string }
): Promise<void> {
  const key = env.RESEND_API_KEY ?? "";
  if (!key) {
    console.log("[payment-watcher] RESEND_API_KEY belum diset — email dilewati");
    return;
  }
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: env.RESEND_FROM || DEFAULT_FROM,
        reply_to: "halo@malika.ai",
        to: o.email,
        subject: `Pembayaran ${o.product} dikonfirmasi ✓`,
        html: `<div style="font-family:Arial,Helvetica,sans-serif;max-width:560px;margin:0 auto;color:#1d1d1f"><div style="background:linear-gradient(135deg,#77ffcd,#6c99fe);padding:20px 24px;border-radius:16px 16px 0 0"><div style="font-size:18px;font-weight:bold;color:#0c1a2b">Malika Agent</div></div><div style="background:#ffffff;border:1px solid #eee;border-top:0;padding:24px;border-radius:0 0 16px 16px"><p>Halo ${o.nama},</p><p>Pembayaranmu sudah kami terima dan <strong>terkonfirmasi</strong>:</p><ul><li>Produk: <strong>${o.product}/bulan</strong></li><li>Total: <strong>${fmtRp(o.amount)}</strong></li><li>Order: <code>${o.order_id}</code></li></ul><p>Setup server Malika Agent kamu memakan waktu <strong>1-3 hari kerja</strong> termasuk greeting & onboarding. Detail akses (URL, email, password) akan kami kirim via email terpisah setelah server siap.</p><p>Terima kasih sudah percaya Malika Agent!</p></div><p style="font-size:12px;color:#888;text-align:center">WhatsApp: +6282211114681 · halo@malika.ai</p></div>`,
        text: `Halo ${o.nama},\n\nPembayaran ${o.product}/bulan (${fmtRp(o.amount)}, order ${o.order_id}) sudah terkonfirmasi.\n\nSetup server memakan waktu 1-3 hari kerja termasuk greeting & onboarding. Detail akses akan dikirim via email terpisah.\n\nTerima kasih!\nMalika Agent`,
      }),
    });
    console.log(`[payment-watcher] email ke ${o.email}: ${res.ok ? "sent" : `gagal ${res.status}`}`);
  } catch (e) {
    console.log(`[payment-watcher] email gagal: ${String(e).slice(0, 200)}`);
  }
}

async function logPayment(
  env: Env,
  row: {
    from_addr: string;
    subject: string;
    parsed_amounts: number[];
    matched_order: string;
    action: string;
    note: string;
  }
): Promise<void> {
  await env.DB.prepare(
    `INSERT INTO payment_logs (received_at, from_addr, subject, parsed_amounts, matched_order, action, note)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  )
    .bind(
      new Date().toISOString(),
      row.from_addr.slice(0, 256),
      row.subject.slice(0, 256),
      JSON.stringify(row.parsed_amounts),
      row.matched_order.slice(0, 64),
      row.action,
      row.note.slice(0, 500)
    )
    .run();
}

async function handleEmail(message: InboundEmail, env: Env): Promise<void> {
  const from = message.from ?? "";
  // Body email (raw MIME -> teks). Forward Gmail ikut terbawa di sini.
  let subject = "";
  let body = "";
  try {
    const rawText = await new Response(message.raw).text();
    const parsed = await PostalMime.parse(rawText);
    subject = parsed.subject ?? "";
    body = `${parsed.text ?? ""}\n${stripHtml(parsed.html ?? "")}`;
  } catch (e) {
    console.log(`[payment-watcher] gagal parse MIME dari ${from}: ${String(e)}`);
    await logPayment(env, {
      from_addr: from,
      subject: "",
      parsed_amounts: [],
      matched_order: "",
      action: "ignored",
      note: "gagal parse MIME",
    });
    return;
  }

  console.log(`[payment-watcher] email dari ${from} ke ${message.to} | subj: ${subject.slice(0, 120)}`);

  const amounts = extractAmounts(`${subject}\n${body}`);
  if (amounts.length === 0) {
    await logPayment(env, {
      from_addr: from,
      subject,
      parsed_amounts: [],
      matched_order: "",
      action: "ignored",
      note: "tidak ada nominal terdeteksi",
    });
    return;
  }

  // Kumpulkan semua order aktif yang totalnya persis sama dengan salah satu nominal.
  const matched = new Map<string, ActiveOrder>();
  for (const amt of amounts) {
    const { results } = await env.DB.prepare(
      `SELECT order_id, product, nama, email, amount, method, unique_code, promo_code FROM orders
       WHERE amount = ? AND status IN ('checkout','payment_proof')`
    )
      .bind(amt)
      .all<ActiveOrder>();
    for (const o of results ?? []) matched.set(o.order_id, o);
  }

  if (matched.size === 0) {
    await logPayment(env, {
      from_addr: from,
      subject,
      parsed_amounts: amounts,
      matched_order: "",
      action: "needs_review",
      note: "nominal tidak cocok order aktif mana pun",
    });
    return;
  }

  const orders = [...matched.values()];
  const qrisOrders = orders.filter((o) => o.unique_code != null);

  // Auto-verify hanya bila tepat 1 order QRIS yang cocok.
  if (orders.length === 1 && qrisOrders.length === 1) {
    const o = qrisOrders[0];
    // Kondisional: kalau admin sudah verifikasi duluan, lewati (hindari dobel hitung).
    const upd = (await env.DB.prepare(
      `UPDATE orders SET status = 'verified', unique_code = NULL, code_expires_at = ''
       WHERE order_id = ? AND status IN ('checkout','payment_proof')`
    )
      .bind(o.order_id)
      .run()) as { meta?: { changes?: number } };
    if (!upd?.meta?.changes) {
      console.log(`[payment-watcher] ${o.order_id} sudah ditangani, lewati`);
      return;
    }
    if (o.promo_code) {
      await env.DB.prepare("UPDATE promos SET used_count = used_count + 1 WHERE code = ?")
        .bind(o.promo_code)
        .run()
        .catch(() => {});
    }
    console.log(`[payment-watcher] VERIFIED ${o.order_id} (${o.product}, ${o.amount})`);
    if (o.email && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(o.email)) {
      await sendPaymentConfirmedMail(env, {
        nama: o.nama,
        product: o.product,
        amount: o.amount,
        order_id: o.order_id,
        email: o.email,
      });
    }
    await logPayment(env, {
      from_addr: from,
      subject,
      parsed_amounts: amounts,
      matched_order: o.order_id,
      action: "verified",
      note: `auto-verified ${o.product} ${o.nama}`,
    });
    return;
  }

  await logPayment(env, {
    from_addr: from,
    subject,
    parsed_amounts: amounts,
    matched_order: orders.map((o) => o.order_id).join(","),
    action: "needs_review",
    note:
      qrisOrders.length === 0
        ? "order cocok tanpa kode unik (transfer?) — verifikasi manual via bukti WA"
        : "nominal cocok >1 order — verifikasi manual",
  });
}

export default {
  async email(message: InboundEmail, env: Env): Promise<void> {
    if (!env.DB) {
      console.log("[payment-watcher] D1 not bound");
      message.setReject("Service unavailable");
      return;
    }
    try {
      await handleEmail(message, env);
    } catch (e) {
      console.log(`[payment-watcher] error: ${String(e)}`);
      // Jangan reject — email notifikasi jangan sampai bounce.
    }
  },

  async fetch(): Promise<Response> {
    return new Response("malika-payment-watcher ok", {
      headers: { "Content-Type": "text/plain" },
    });
  },

  /* Cron harian (02:00): 1) sinkron jatuh tempo IndoVM ke DB (sekali sehari,
     agar UI tidak hit IndoVM tiap saat), 2) reminder perpanjangan H-7/H-1.
     Masa aktif = server_due (vps_tempo_at) bila ada, fallback retensi_at+30h. */
  async scheduled(_event: unknown, env: Env): Promise<void> {
    if (!env.DB) {
      console.log("[payment-watcher] cron: D1 not bound");
      return;
    }
    try {
      await syncVpsDueDates(env);
    } catch (e) {
      console.log(`[payment-watcher] cron sync VPS error: ${String(e).slice(0, 200)}`);
    }
    try {
      const { results } = await env.DB.prepare(
        `SELECT o.order_id, o.product, o.nama, o.email, o.amount, o.retensi_at,
                o.renewal_count, o.last_reminder_at, d.vps_tempo_at
         FROM orders o LEFT JOIN deploy_configs d ON d.order_id = o.order_id
         WHERE o.status IN ('retensi','resubscribe') AND o.retensi_at != ''`
      ).all<{
        order_id: string;
        product: string;
        nama: string;
        email: string;
        amount: number;
        retensi_at: string;
        renewal_count: number;
        last_reminder_at: string;
        vps_tempo_at: string;
      }>();
      const now = Date.now();
      for (const o of results ?? []) {
        const serverIso = String(o.vps_tempo_at ?? "").slice(0, 10);
        const expiry = /^\d{4}-\d{2}-\d{2}$/.test(serverIso)
          ? new Date(`${serverIso}T00:00:00Z`).getTime()
          : new Date(o.retensi_at).getTime() + 30 * 864e5;
        if (!Number.isFinite(expiry) || expiry <= now) continue;
        const daysLeft = Math.round((expiry - now) / 864e5);
        const tag = daysLeft <= 1 ? "H1" : daysLeft <= 7 ? "H7" : "";
        if (!tag) continue;
        const expiryDay = new Date(expiry).toISOString().slice(0, 10);
        if (o.last_reminder_at === `${expiryDay}|${tag}`) continue;
        if (!o.email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(o.email)) continue;
        await sendRenewalReminder(env, { ...o, tag, expiryDay });
        await env.DB.prepare("UPDATE orders SET last_reminder_at = ? WHERE order_id = ?")
          .bind(`${expiryDay}|${tag}`, o.order_id)
          .run()
          .catch(() => {});
      }
    } catch (e) {
      console.log(`[payment-watcher] cron error: ${String(e).slice(0, 200)}`);
    }
  },
};

/* Sinkron harian jatuh tempo IndoVM -> deploy_configs (sekali sehari).
   Flow lookup SAMA dengan Tab Server (lihat functions/api/_indovm.ts —
   worker tidak bisa impor file Pages, jadi mirror di sini; ubah berbarengan).
   Best-effort: token belum diset / lookup gagal = lewati, reminder tetap jalan. */
async function syncVpsDueDates(env: Env): Promise<void> {
  const token = (env.INDOVM_LOOKUP_TOKEN ?? "").trim();
  if (!token) {
    console.log("[payment-watcher] cron sync: INDOVM_LOOKUP_TOKEN belum diset — dilewati");
    return;
  }
  const url = (env.INDOVM_LOOKUP_URL || "https://flow-new.malika.ai/webhook/lookup-server-indovm").trim();
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), 25000);
  try {
    const res = await fetch(url, { headers: { Authorization: token }, signal: ctl.signal });
    if (!res.ok) throw new Error(`lookup ${res.status}`);
    const raw = (await res.json()) as
      | { vps?: { service_id?: unknown; status_layanan?: unknown; periode_pembayaran?: unknown; jatuh_tempo?: unknown; akses?: { ip?: unknown }; penggunaan?: { online?: unknown } }[] }[]
      | { vps?: { service_id?: unknown; status_layanan?: unknown; periode_pembayaran?: unknown; jatuh_tempo?: unknown; akses?: { ip?: unknown }; penggunaan?: { online?: unknown } }[] };
    const list = Array.isArray(raw) ? raw.flatMap((g) => g.vps ?? []) : raw.vps ?? [];
    const now = new Date().toISOString();
    let updated = 0;
    for (const v of list) {
      const sid = String(v.service_id ?? "").trim();
      if (!sid) continue;
      const tempo = String(v.jatuh_tempo ?? "").trim().slice(0, 32);
      const r = (await env.DB.prepare(
        `UPDATE deploy_configs SET vps_status = ?, vps_periode = ?, vps_tempo = ?,
          vps_tempo_at = ?, vps_ip = ?, vps_online = ?, vps_synced_at = ?, updated_at = ?
         WHERE vps_id = ?`
      )
        .bind(
          String(v.status_layanan ?? "").slice(0, 64),
          String(v.periode_pembayaran ?? "").slice(0, 64),
          tempo, tempoToIso(tempo),
          String(v.akses?.ip ?? "").split(";")[0].trim().slice(0, 128),
          v.penggunaan?.online === true ? 1 : 0,
          now, now, sid
        )
        .run()) as { meta?: { changes?: number } };
      updated += r?.meta?.changes ?? 0;
    }
    console.log(`[payment-watcher] cron sync VPS: ${updated}/${list.length} baris (synced_at ${now})`);
  } finally {
    clearTimeout(timer);
  }
}

function tempoToIso(t: string): string {
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

async function sendRenewalReminder(
  env: Env,
  o: {
    nama: string;
    product: string;
    amount: number;
    order_id: string;
    email: string;
    renewal_count: number;
    tag: string;
    expiryDay: string;
  }
): Promise<void> {
  const key = env.RESEND_API_KEY ?? "";
  if (!key) {
    console.log("[payment-watcher] cron: RESEND_API_KEY belum diset — reminder dilewati");
    return;
  }
  const when = o.tag === "H1" ? "besok" : "7 hari lagi";
  const expId = new Date(o.expiryDay + "T00:00:00Z").toLocaleDateString("id-ID", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: env.RESEND_FROM || DEFAULT_FROM,
        reply_to: "halo@malika.ai",
        to: o.email,
        subject: `Langganan Malika Agent berakhir ${when} — perpanjang yuk`,
        html: `<div style="font-family:Arial,Helvetica,sans-serif;max-width:560px;margin:0 auto;color:#1d1d1f"><div style="background:linear-gradient(135deg,#77ffcd,#6c99fe);padding:20px 24px;border-radius:16px 16px 0 0"><div style="font-size:18px;font-weight:bold;color:#0c1a2b">Malika Agent</div></div><div style="background:#ffffff;border:1px solid #eee;border-top:0;padding:24px;border-radius:0 0 16px 16px"><p>Halo ${o.nama},</p><p>Masa aktif <strong>${o.product}</strong> kamu berakhir <strong>${expId}</strong>${o.renewal_count > 0 ? ` (perpanjangan ke-${o.renewal_count})` : ""}.</p><p>Perpanjang sekarang agar agent tetap bekerja tanpa jeda — cukup balas email ini atau hubungi WhatsApp kami.</p><p>Order: <code>${o.order_id}</code> · Terakhir: <strong>${fmtRp(o.amount)}</strong></p></div><p style="font-size:12px;color:#888;text-align:center">WhatsApp: +6282211114681 · halo@malika.ai</p></div>`,
        text: `Halo ${o.nama},\n\nMasa aktif ${o.product} berakhir ${expId}. Perpanjang sekarang agar agent tetap bekerja tanpa jeda — balas email ini atau hubungi WhatsApp kami.\n\nOrder: ${o.order_id}`,
      }),
    });
    console.log(`[payment-watcher] reminder ${o.tag} ke ${o.email}: ${res.ok ? "sent" : `gagal ${res.status}`}`);
  } catch (e) {
    console.log(`[payment-watcher] reminder gagal: ${String(e).slice(0, 200)}`);
  }
}
