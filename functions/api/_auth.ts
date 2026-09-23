/* Sesi staff + matriks izin per divisi (diimpor Pages Functions).
   File underscore = tidak jadi route, hanya untuk diimpor.

   Divisi: marketing | sales | support | it | ai_engineer | retensi | bisdev | admin
   Token cookie `malika_admin`: expHex.rand.uid.division.admin.sig
   dengan sig = HMAC-SHA256(secret, "expHex.rand.uid.division.admin").
*/

interface D1Prepared {
  bind(...values: unknown[]): D1Prepared;
  first<T = Record<string, unknown>>(): Promise<T | null>;
  all<T = Record<string, unknown>>(): Promise<{ results: T[] }>;
  run(): Promise<unknown>;
}
export interface D1Database {
  prepare(query: string): D1Prepared;
}
export interface EnvBase {
  DB: D1Database;
  SESSION_SECRET?: string;
}

export interface Session {
  uid: number;
  username: string;
  division: string;
  is_admin: boolean;
}

export const COOKIE = "malika_admin";
export const SESSION_TTL = 12 * 3600; // detik

export function normDivision(raw: unknown): string {
  return String(raw ?? "").trim().toLowerCase().replace(/[\s-]+/g, "_");
}

function hex(bytes: ArrayBuffer): string {
  return [...new Uint8Array(bytes)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export async function sha256Hex(s: string): Promise<string> {
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
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(msg));
  return hex(sig);
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
}

export async function signSession(
  secret: string,
  s: { uid: number; username: string; division: string; is_admin: boolean }
): Promise<string> {
  const exp = Math.floor(Date.now() / 1000) + SESSION_TTL;
  const randBytes = crypto.getRandomValues(new Uint8Array(16));
  const rand = [...randBytes].map((b) => b.toString(16).padStart(2, "0")).join("");
  const a = s.is_admin ? "1" : "0";
  const body = `${exp.toString(16)}.${rand}.${s.uid}.${s.division}.${a}`;
  return `${body}.${await hmacHex(secret, body)}`;
}

export function sessionCookie(token: string, maxAge: number): string {
  return `${COOKIE}=${encodeURIComponent(token)}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=${maxAge}`;
}

/* Verifikasi cookie -> Session, sekaligus pastikan user masih aktif. */
export async function getSession(req: Request, env: EnvBase): Promise<Session | null> {
  const secret = env.SESSION_SECRET ?? "";
  if (!secret || !env.DB) return null;
  const m = (req.headers.get("cookie") ?? "").match(/(?:^|;\s*)malika_admin=([^;]+)/);
  if (!m) return null;
  const parts = decodeURIComponent(m[1]).split(".");
  if (parts.length !== 6) return null;
  const [expHex, rand, uidStr, division, a, sig] = parts;
  const exp = parseInt(expHex, 16);
  if (!Number.isFinite(exp) || exp < Date.now() / 1000) return null;
  if (!/^[0-9a-f]{32}$/.test(rand)) return null;
  if (!/^\d+$/.test(uidStr) || (a !== "0" && a !== "1")) return null;
  const want = await hmacHex(secret, `${expHex}.${rand}.${uidStr}.${division}.${a}`);
  if (!timingSafeEqual(want, sig.toLowerCase())) return null;
  const row = await env.DB.prepare("SELECT username, division, is_admin, active FROM users WHERE id = ?")
    .bind(Number(uidStr))
    .first<{ username: string; division: string; is_admin: number; active: number }>()
    .catch(() => null);
  if (!row || !row.active) return null;
  return {
    uid: Number(uidStr),
    username: row.username,
    division: normDivision(row.division),
    is_admin: row.is_admin === 1,
  };
}

/* --- Matriks visibilitas order per divisi (status yang boleh dilihat) --- */
const ALL_STAGES = [
  "checkout",
  "payment_proof",
  "verified",
  "setup_server",
  "retensi",
  "churn",
  "resubscribe",
  "cancelled",
];

const VIEW_STAGES: Record<string, string[]> = {
  marketing: ["checkout", "payment_proof", "verified"],
  sales: ["checkout", "payment_proof", "verified"],
  support: ["verified", "setup_server", "retensi"],
  it: ["verified", "setup_server", "retensi"],
  ai_engineer: ["verified", "setup_server", "retensi"],
  retensi: ["retensi", "resubscribe", "churn"],
  bisdev: ALL_STAGES,
};

export function visibleStages(s: Session): string[] | null {
  if (s.is_admin || s.division === "admin") return null; // null = semua
  return VIEW_STAGES[s.division] ?? [];
}

/* --- Matriks aksi: transisi status yang boleh dilakukan --- */
export function canTransition(s: Session, from: string, to: string): boolean {
  if (s.is_admin || s.division === "admin") return true;
  const d = s.division;
  // Sales: verifikasi + batalkan order masuk.
  if (d === "sales") {
    if (from === "payment_proof" && to === "verified") return true;
    if ((from === "checkout" || from === "payment_proof") && to === "cancelled") return true;
    return false;
  }
  // Support: mulai setup + sudah itu saja (selain flag onboard).
  if (d === "support") {
    if (from === "verified" && to === "setup_server") return true;
    return false;
  }
  // IT / AI engineer: jalankan setup sampai retensi.
  if (d === "it" || d === "ai_engineer") {
    if (from === "verified" && to === "setup_server") return true;
    if (from === "setup_server" && to === "retensi") return true;
    return false;
  }
  // Retensi: churn / perpanjang.
  if (d === "retensi") {
    if (from === "retensi" && (to === "churn" || to === "resubscribe")) return true;
    if (from === "resubscribe" && to === "churn") return true;
    return false;
  }
  return false;
}

/* Flag onboarding paralel boleh dicentang oleh divisi pelaksana. */
export function canSetOnboard(s: Session): boolean {
  if (s.is_admin || s.division === "admin") return true;
  return ["support", "it", "ai_engineer"].includes(s.division);
}

/* Kirim credential (POST /api/clients): pelaksana saat setup_server. */
export function canSendCredential(s: Session, orderStatus: string): boolean {
  if (s.is_admin || s.division === "admin") return true;
  if ((s.division === "it" || s.division === "ai_engineer") && orderStatus === "setup_server") return true;
  return false;
}

/* Kelola katalog (pricing/promos) + hapus order: admin saja. */
export function canManageCatalog(s: Session): boolean {
  return s.is_admin || s.division === "admin";
}

/* Lihat log pembayaran: pelaksana + retensi + bisdev + admin. */
export function canViewLogs(s: Session): boolean {
  if (s.is_admin || s.division === "admin") return true;
  return ["support", "it", "ai_engineer", "retensi", "bisdev"].includes(s.division);
}

/* Lihat daftar akses klien: pelaksana akses + admin. */
export function canViewClients(s: Session): boolean {
  if (s.is_admin || s.division === "admin") return true;
  return ["it", "ai_engineer", "support"].includes(s.division);
}

export function canDeleteOrder(s: Session): boolean {
  return s.is_admin || s.division === "admin";
}

export function canManageUsers(s: Session): boolean {
  return s.is_admin || s.division === "admin";
}

export const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, GET, PATCH, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};
