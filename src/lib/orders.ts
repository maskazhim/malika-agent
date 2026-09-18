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
