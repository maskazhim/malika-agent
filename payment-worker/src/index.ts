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
}

const DEFAULT_FROM = "Malika Agent <halo@malika.ai>";

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
        to: o.email,
        subject: `Pembayaran ${o.product} dikonfirmasi ✓`,
        html: `<div style="font-family:Arial,Helvetica,sans-serif;max-width:560px;margin:0 auto;color:#1d1d1f"><div style="background:linear-gradient(135deg,#77ffcd,#6c99fe);padding:20px 24px;border-radius:16px 16px 0 0"><div style="font-size:18px;font-weight:bold;color:#0c1a2b">Malika Agent</div></div><div style="background:#ffffff;border:1px solid #eee;border-top:0;padding:24px;border-radius:0 0 16px 16px"><p>Halo ${o.nama},</p><p>Pembayaranmu sudah kami terima dan <strong>terkonfirmasi</strong>:</p><ul><li>Produk: <strong>${o.product}/bulan</strong></li><li>Total: <strong>${fmtRp(o.amount)}</strong></li><li>Order: <code>${o.order_id}</code></li></ul><p>Setup server Malika Agent kamu memakan waktu <strong>1-3 hari kerja</strong> termasuk onboarding. Detail akses (URL, email, password) akan kami kirim via email terpisah setelah server siap.</p><p>Terima kasih sudah percaya Malika Agent!</p></div><p style="font-size:12px;color:#888;text-align:center">WhatsApp: +628221114681 · halo@malika.ai</p></div>`,
        text: `Halo ${o.nama},\n\nPembayaran ${o.product}/bulan (${fmtRp(o.amount)}, order ${o.order_id}) sudah terkonfirmasi.\n\nSetup server memakan waktu 1-3 hari kerja termasuk onboarding. Detail akses akan dikirim via email terpisah.\n\nTerima kasih!\nMalika Agent`,
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
      `SELECT order_id, product, nama, email, amount, method, unique_code FROM orders
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
    await env.DB.prepare(
      "UPDATE orders SET status = 'verified', unique_code = NULL, code_expires_at = '' WHERE order_id = ?"
    )
      .bind(o.order_id)
      .run();
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
};
