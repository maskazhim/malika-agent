/* Client helper untuk menyimpan order ke D1 via Pages Functions.
   POST /api/orders -> functions/api/orders.ts (binding D1 `DB`).
   Kalau API belum tersedia (dev lokal / belum binding), fallback ke localStorage
   agar order tidak hilang. */

export type OrderMethod = "qris" | "transfer";
export type OrderStatus = "checkout" | "payment_proof";

export interface OrderPayload {
  order_id: string;
  product: string;
  amount: number;
  nama: string;
  bisnis: string;
  telepon: string;
  email: string;
  method?: OrderMethod | "";
  bukti_filename?: string;
  status: OrderStatus;
  unique_code?: number | null;
  code_expires_at?: string;
  promo_code?: string;
}

export interface PromoCheck {
  code: string;
  type: string;
  value: number;
}

/* Validasi kode promo ke server. Return null bila tidak valid / API gagal. */
export async function checkPromo(code: string): Promise<PromoCheck | null> {
  const c = code.trim().toUpperCase();
  if (!c) return null;
  try {
    const res = await fetch(`/api/promos?code=${encodeURIComponent(c)}`);
    const data = (await res.json()) as Partial<PromoCheck> & { ok?: boolean };
    if (!res.ok || !data.ok) return null;
    return { code: String(data.code), type: String(data.type), value: Number(data.value) };
  } catch {
    return null;
  }
}

/* Hitung diskon rupiah dari harga dasar. */
export function calcDiscount(p: PromoCheck, base: number): number {
  if (p.type === "fixed") return Math.max(0, Math.min(Math.round(p.value), base));
  const pct = Math.max(0, Math.min(100, Math.round(p.value)));
  return Math.round((base * pct) / 100);
}

/* Nomor WhatsApp admin untuk konfirmasi transfer (sama dengan di Footer). */
export const ADMIN_WA = "6285124317811";

/* Label produk + masa langganan, mis. "Growth/bulan" atau "Growth · 6 bulan". */
export function productLabel(product: string, months: number): string {
  return months > 1 ? `${product} · ${months} bulan` : `${product}/bulan`;
}

/* Nilai yang disimpan ke kolom product DB (durasi hanya ditempel bila >1 bulan). */
export function storedProduct(product: string, months: number): string {
  return months > 1 ? `${product} · ${months} bulan` : product;
}

/* Opsi masa langganan (bulan). Harga flat: harga bulanan × durasi. */
export const DURATIONS = [1, 6, 12] as const;
export type DurationMonths = (typeof DURATIONS)[number];

export function durationLabel(m: number): string {
  if (m >= 12) return "1 Tahun";
  if (m > 1) return `${m} Bulan`;
  return "1 Bulan";
}

export function buildTransferWaLink(o: {
  order_id: string;
  product: string;
  amount: number;
  nama: string;
}): string {
  const msg =
    `Halo Malika Agent, saya konfirmasi pembayaran transfer.\n\n` +
    `Order: ${o.order_id}\n` +
    `Produk: ${o.product}\n` +
    `Total: Rp${o.amount.toLocaleString("id-ID")}\n` +
    `Nama: ${o.nama}\n\n` +
    `Silakan kirimkan bukti transfer untuk diverifikasi.`;
  return `https://wa.me/${ADMIN_WA}?text=${encodeURIComponent(msg)}`;
}

export interface AllocatedCode {
  unique_code: number;
  expires_at: string;
  base: number;
  amount: number;
  reused: boolean;
}

/* Minta kode unik 1-999 ke server (POST /api/allocate-code).
   `base` opsional = total sebelum kode unik (dipakai saat nominal berubah,
   mis. ganti masa langganan di halaman payment).
   Return null bila API belum tersedia — caller wajib menangani fallback. */
export async function allocateCode(order_id: string, base?: number): Promise<AllocatedCode | null> {
  try {
    const res = await fetch("/api/allocate-code", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(
        Number.isFinite(Number(base)) && Number(base) > 0
          ? { order_id, base: Math.round(Number(base)) }
          : { order_id }
      ),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as Partial<AllocatedCode> & { ok?: boolean };
    if (!data.ok || !Number.isFinite(Number(data.unique_code))) return null;
    return {
      unique_code: Math.round(Number(data.unique_code)),
      expires_at: String(data.expires_at ?? ""),
      base: Math.round(Number(data.base ?? 0)),
      amount: Math.round(Number(data.amount ?? 0)),
      reused: Boolean(data.reused),
    };
  } catch {
    return null;
  }
}

const LS_KEY = "malika_orders";

function queueLocal(order: OrderPayload) {
  try {
    const raw = localStorage.getItem(LS_KEY);
    const arr = raw ? (JSON.parse(raw) as OrderPayload[]) : [];
    const i = arr.findIndex((o) => o.order_id === order.order_id);
    if (i >= 0) arr[i] = { ...arr[i], ...order };
    else arr.push(order);
    localStorage.setItem(LS_KEY, JSON.stringify(arr));
  } catch {
    /* abaikan */
  }
}

export async function saveOrder(order: OrderPayload): Promise<"d1" | "local"> {
  queueLocal(order);
  try {
    const res = await fetch("/api/orders", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...order, created_at: new Date().toISOString() }),
    });
    if (!res.ok) return "local";
    // sinkron: hapus dari antrean lokal kalau sudah masuk D1? simpan saja sebagai cache.
    return "d1";
  } catch {
    return "local";
  }
}

export function newOrderId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return `ord-${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
}
