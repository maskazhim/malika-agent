/* Helper kirim email via Resend (dipakai Pages Functions).
   File underscore = tidak jadi route, hanya untuk diimpor.
   Env yang dibutuhkan (Pages > Settings > Environment variables):
     RESEND_API_KEY — wajib
     RESEND_FROM    — opsional, default "Malika Agent <noreply@malikaagent.my.id>"
*/

export interface EnvWithMail {
  RESEND_API_KEY?: string;
  RESEND_FROM?: string;
}

export const DEFAULT_FROM = "Malika Agent <noreply@malikaagent.my.id>";
export const REPLY_TO = "halo@malika.ai";

/* PDF onboarding + dokumentasi yang ikut di email credential. */
export const ONBOARDING_PDF_URL =
  "https://drive.google.com/uc?export=download&id=1PesE5eWfUWUl9_j-e7VMAbaazkZPfnjm";
export const ONBOARDING_PDF_NAME = "Onboarding-Malika-Agent.pdf";
export const DOCS_URL = "https://docs.malika.ai/s/08afd73a-82a1-4319-8c3d-e6d7af88eaf0";

export interface MailAttachment {
  filename: string;
  content: string; // base64
}

export async function fetchOnboardingPdf(): Promise<MailAttachment | null> {
  try {
    const res = await fetch(ONBOARDING_PDF_URL, { redirect: "follow" });
    if (!res.ok) return null;
    const buf = await res.arrayBuffer();
    if (!buf.byteLength || buf.byteLength > 20 * 1024 * 1024) return null;
    const bytes = new Uint8Array(buf);
    let bin = "";
    const CHUNK = 8192;
    for (let i = 0; i < bytes.length; i += CHUNK) {
      bin += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
    }
    // Sanity: harus diawali header PDF.
    if (!bin.startsWith("%PDF")) return null;
    return { filename: ONBOARDING_PDF_NAME, content: btoa(bin) };
  } catch {
    return null;
  }
}

export function fmtRp(n: number): string {
  return "Rp" + Number(n).toLocaleString("id-ID");
}

export async function sha256Hex(s: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export async function sendMail(
  env: EnvWithMail,
  msg: { to: string; subject: string; html: string; text: string; attachments?: MailAttachment[] }
): Promise<{ ok: boolean; error?: string }> {
  const key = env.RESEND_API_KEY ?? "";
  if (!key) return { ok: false, error: "RESEND_API_KEY belum diset" };
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: env.RESEND_FROM || DEFAULT_FROM,
        reply_to: REPLY_TO,
        to: msg.to,
        subject: msg.subject,
        html: msg.html,
        text: msg.text,
        attachments: (msg.attachments ?? []).map((a) => ({ filename: a.filename, content: a.content })),
      }),
    });
    if (!res.ok) {
      const t = await res.text().catch(() => "");
      return { ok: false, error: `resend ${res.status}: ${t.slice(0, 200)}` };
    }
    return { ok: true };
  } catch (e) {
    return { ok: false, error: String(e).slice(0, 200) };
  }
}

const WRAP = (inner: string) => `
<div style="font-family:Arial,Helvetica,sans-serif;max-width:560px;margin:0 auto;color:#1d1d1f">
  <div style="background:linear-gradient(135deg,#77ffcd,#6c99fe);padding:20px 24px;border-radius:16px 16px 0 0">
    <div style="font-size:18px;font-weight:bold;color:#0c1a2b">Malika Agent</div>
  </div>
  <div style="background:#ffffff;border:1px solid #eee;border-top:0;padding:24px;border-radius:0 0 16px 16px">
    ${inner}
  </div>
  <p style="font-size:12px;color:#888;text-align:center">WhatsApp: +6282211114681 · halo@malika.ai</p>
</div>`;

export function paymentConfirmedMail(o: {
  nama: string;
  product: string;
  amount: number;
  order_id: string;
}): { subject: string; html: string; text: string } {
  const subject = `Pembayaran ${o.product} dikonfirmasi ✓`;
  const inner = `
    <p>Halo ${o.nama},</p>
    <p>Pembayaranmu sudah kami terima dan <strong>terkonfirmasi</strong>:</p>
    <ul>
      <li>Produk: <strong>${o.product}/bulan</strong></li>
      <li>Total: <strong>${fmtRp(o.amount)}</strong></li>
      <li>Order: <code>${o.order_id}</code></li>
    </ul>
    <p>Setup server Malika Agent kamu memakan waktu <strong>1-3 hari kerja</strong> termasuk greeting & onboarding. Detail akses (URL, email, password) akan kami kirim via email terpisah setelah server siap.</p>
    <p>Terima kasih sudah percaya Malika Agent!</p>`;
  return {
    subject,
    html: WRAP(inner),
    text: `Halo ${o.nama},\n\nPembayaran ${o.product}/bulan (${fmtRp(o.amount)}, order ${o.order_id}) sudah terkonfirmasi.\n\nSetup server memakan waktu 1-3 hari kerja termasuk greeting & onboarding. Detail akses akan dikirim via email terpisah.\n\nTerima kasih!\nMalika Agent`,
  };
}

export function accountReadyMail(c: {
  client_name: string;
  access_url: string;
  email: string;
  password: string;
}): { subject: string; html: string; text: string } {
  const subject = `Akses Malika Agent kamu sudah aktif`;
  const inner = `
    <p>Halo ${c.client_name},</p>
    <p>Server Malika Agent kamu sudah siap. Berikut detail aksesnya:</p>
    <ul>
      <li>URL akses: <a href="${c.access_url}"><strong>${c.access_url}</strong></a></li>
      <li>Email: <strong>${c.email}</strong></li>
      <li>Password: <strong>${c.password}</strong></li>
    </ul>
    <p>📎 Panduan onboarding terlampir di email ini (${ONBOARDING_PDF_NAME}).<br>
    📖 <a href="${DOCS_URL}">Klik untuk lihat Dokumentasi Malika Agent</a></p>
    <p>Simpan baik-baik dan jangan bagikan ke siapa pun. Kalau ada kendala login, balas email ini atau hubungi WhatsApp kami.</p>
    <p>Selamat bekerja dengan karyawan digital barumu!</p>`;
  return {
    subject,
    html: WRAP(inner),
    text: `Halo ${c.client_name},\n\nServer Malika Agent kamu sudah siap.\n\nURL akses: ${c.access_url}\nEmail: ${c.email}\nPassword: ${c.password}\n\nPanduan onboarding terlampir di email ini.\nDokumentasi lengkap: ${DOCS_URL}\n\nSimpan baik-baik dan jangan bagikan ke siapa pun.\n\nMalika Agent`,
  };
}

/* Email akses agent: dikirim otomatis saat order pindah setup_server -> onboard.
   Tanpa credential — customer signup sendiri saat pertama kali membuka URL. */
export function agentAccessMail(c: {
  client_name: string;
  access_url: string;
}): { subject: string; html: string; text: string } {
  const subject = `Malika Agent kamu sudah siap`;
  const inner = `
    <p>Halo ${c.client_name},</p>
    <p>Kabar baik — server Malika Agent kamu sudah siap dan bisa diakses di:</p>
    <p style="text-align:center;margin:20px 0">
      <a href="${c.access_url}" style="display:inline-block;background:#0d9488;color:#fff!important;text-decoration:none;font-weight:bold;padding:12px 28px;border-radius:999px">Buka Malika Agent →</a>
    </p>
    <p style="font-size:12px;color:#888">Atau salin URL ini ke browser:<br><code>${c.access_url}</code></p>
    <p>Saat pertama kali dibuka, silakan <strong>signup / buat akun kamu sendiri</strong> langsung di halaman tersebut.</p>
    <p>📎 Panduan onboarding terlampir di email ini (${ONBOARDING_PDF_NAME}).<br>
    📖 <a href="${DOCS_URL}">Klik untuk lihat Dokumentasi Malika Agent</a></p>
    <p>Kalau ada kendala, balas email ini atau hubungi WhatsApp kami.</p>`;
  return {
    subject,
    html: WRAP(inner),
    text: `Halo ${c.client_name},\n\nServer Malika Agent kamu sudah siap dan bisa diakses di:\n${c.access_url}\n\nSaat pertama kali dibuka, silakan signup / buat akun kamu sendiri langsung di halaman tersebut.\n\nPanduan onboarding terlampir di email ini.\nDokumentasi lengkap: ${DOCS_URL}\n\nMalika Agent`,
  };
}

export function magicLinkMail(o: {
  nama: string;
  link: string;
  expiry_menit: number;
}): { subject: string; html: string; text: string } {
  const subject = `Link login portal Malika Agent`;
  const inner = `
    <p>Halo ${o.nama},</p>
    <p>Klik tombol di bawah untuk masuk ke portal customer Malika Agent (lihat langganan & Malika Agent kamu):</p>
    <p style="text-align:center;margin:20px 0">
      <a href="${o.link}" style="display:inline-block;background:#0d9488;color:#fff!important;text-decoration:none;font-weight:bold;padding:12px 28px;border-radius:999px">Masuk ke Portal →</a>
    </p>
    <p style="font-size:12px;color:#888">Atau salin link ini ke browser:<br><code>${o.link}</code></p>
    <p>Link ini hanya bisa dipakai <strong>sekali</strong> dan berlaku <strong>${o.expiry_menit} menit</strong>. Jangan bagikan ke siapa pun. Kalau kamu tidak meminta link ini, abaikan email ini.</p>`;
  return {
    subject,
    html: WRAP(inner),
    text: `Halo ${o.nama},\n\nKlik link ini untuk masuk ke portal customer Malika Agent:\n${o.link}\n\nLink hanya bisa dipakai sekali dan berlaku ${o.expiry_menit} menit. Jangan bagikan ke siapa pun.\n\nMalika Agent`,
  };
}
