"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { formatRp } from "@/lib/qris";

interface Order {
  order_id: string;
  product: string;
  amount: number;
  nama: string;
  bisnis: string;
  telepon: string;
  email: string;
  method: string;
  bukti_filename: string;
  status: string;
  created_at: string;
  unique_code: number | null;
  code_expires_at: string;
}

const FILTERS = [
  { key: "", label: "Semua" },
  { key: "payment_proof", label: "Perlu verifikasi" },
  { key: "verified", label: "Terverifikasi" },
  { key: "checkout", label: "Checkout" },
  { key: "cancelled", label: "Batal" },
];

const STATUS_STYLE: Record<string, string> = {
  payment_proof: "bg-amber-100 text-amber-800",
  verified: "bg-teal-100 text-teal-800",
  checkout: "bg-stone-200 text-stone-600",
  cancelled: "bg-red-100 text-red-700",
};

const STATUS_LABEL: Record<string, string> = {
  payment_proof: "Perlu verifikasi",
  verified: "Terverifikasi",
  checkout: "Checkout",
  cancelled: "Batal",
};

export default function AdminPage() {
  const router = useRouter();
  const [auth, setAuth] = useState<"checking" | "ok">("checking");
  const [orders, setOrders] = useState<Order[]>([]);
  const [filter, setFilter] = useState("");
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(
    async (status: string) => {
      setLoading(true);
      setError(null);
      try {
        const url = status ? `/api/orders?status=${encodeURIComponent(status)}` : "/api/orders";
        const res = await fetch(url);
        if (res.status === 401) {
          router.replace("/login");
          return;
        }
        if (!res.ok) throw new Error("gagal");
        const data = (await res.json()) as { orders?: Order[] };
        setOrders(data.orders ?? []);
      } catch {
        setError("Gagal memuat order. Coba muat ulang.");
      } finally {
        setLoading(false);
      }
    },
    [router]
  );

  useEffect(() => {
    fetch("/api/auth")
      .then((r) => {
        if (!r.ok) router.replace("/login");
        else {
          setAuth("ok");
          void load("");
        }
      })
      .catch(() => router.replace("/login"));
  }, [router, load]);

  function changeFilter(key: string) {
    setFilter(key);
    void load(key);
  }

  async function setStatus(order_id: string, status: string) {
    setUpdating(order_id);
    try {
      const res = await fetch("/api/orders", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ order_id, status }),
      });
      if (res.status === 401) {
        router.replace("/login");
        return;
      }
      if (!res.ok) throw new Error("gagal");
      setOrders((os) => os.map((o) => (o.order_id === order_id ? { ...o, status } : o)));
    } catch {
      setError("Gagal update status.");
    } finally {
      setUpdating(null);
    }
  }

  async function logout() {
    await fetch("/api/auth", { method: "DELETE" }).catch(() => {});
    router.replace("/login");
  }

  if (auth === "checking") {
    return <main className="mx-auto max-w-6xl px-4 py-20 text-center text-sm text-stone-500">Memeriksa sesi…</main>;
  }

  return (
    <main className="mx-auto w-full max-w-6xl px-4 py-10 sm:px-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-widest text-teal-700">Malika · Internal</p>
          <h1 className="mt-1 text-3xl font-semibold tracking-tight">Dashboard Order</h1>
        </div>
        <button
          onClick={logout}
          className="rounded-full bg-white/70 px-5 py-2 text-sm font-semibold ring-1 ring-white hover:bg-white"
        >
          Keluar
        </button>
      </div>

      <div className="glass mt-5 flex flex-wrap gap-1 rounded-2xl p-1 text-sm font-semibold">
        {FILTERS.map((f) => (
          <button
            key={f.key}
            onClick={() => changeFilter(f.key)}
            className={`rounded-xl px-4 py-2 transition ${
              filter === f.key ? "malika-gradient text-white shadow" : "text-stone-500 hover:bg-white/70 hover:text-stone-900"
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {error && (
        <p className="mt-4 rounded-xl bg-red-50 px-3 py-2 text-xs font-medium text-red-600 ring-1 ring-red-100">
          {error}
        </p>
      )}

      <div className="glass-strong mt-4 overflow-x-auto rounded-3xl">
        {loading ? (
          <p className="p-8 text-center text-sm text-stone-500">Memuat order…</p>
        ) : orders.length === 0 ? (
          <p className="p-8 text-center text-sm text-stone-500">Belum ada order pada filter ini.</p>
        ) : (
          <table className="w-full min-w-3xl text-left text-sm">
            <thead>
              <tr className="border-b border-white/70 text-xs uppercase tracking-wider text-stone-400">
                <th className="px-4 py-3 font-semibold">Order</th>
                <th className="px-4 py-3 font-semibold">Customer</th>
                <th className="px-4 py-3 font-semibold">Kontak</th>
                <th className="px-4 py-3 font-semibold">Total</th>
                <th className="px-4 py-3 font-semibold">Status</th>
                <th className="px-4 py-3 font-semibold">Aksi</th>
              </tr>
            </thead>
            <tbody>
              {orders.map((o) => (
                <tr key={o.order_id} className="border-b border-white/50 last:border-0 hover:bg-white/40">
                  <td className="px-4 py-3">
                    <p className="font-semibold">{o.product}</p>
                    <p className="font-mono text-[11px] text-stone-400">{o.order_id.slice(0, 8)}…</p>
                    <p className="text-[11px] text-stone-400">
                      {o.method === "transfer" ? "Transfer Bank" : o.method === "qris" ? "QRIS" : "-"} ·{" "}
                      {o.created_at ? new Date(o.created_at).toLocaleString("id-ID") : "-"}
                    </p>
                  </td>
                  <td className="px-4 py-3">
                    <p className="font-medium">{o.nama}</p>
                    <p className="text-xs text-stone-500">{o.bisnis}</p>
                  </td>
                  <td className="px-4 py-3 text-xs">
                    <p>{o.telepon}</p>
                    <p className="text-stone-500">{o.email}</p>
                  </td>
                  <td className="px-4 py-3">
                    <p className="font-bold">{formatRp(o.amount)}</p>
                    {o.unique_code != null && (
                      <p className="mt-0.5 inline-block rounded-full bg-teal-100 px-2 py-0.5 text-[11px] font-semibold text-teal-800">
                        kode +{o.unique_code}
                      </p>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`inline-block rounded-full px-2.5 py-1 text-[11px] font-semibold ${STATUS_STYLE[o.status] ?? "bg-stone-200 text-stone-600"}`}
                    >
                      {STATUS_LABEL[o.status] ?? o.status}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex gap-1.5">
                      {o.status === "payment_proof" && (
                        <button
                          onClick={() => setStatus(o.order_id, "verified")}
                          disabled={updating === o.order_id}
                          className="malika-gradient rounded-full px-3 py-1.5 text-[11px] font-semibold text-white hover:opacity-90 disabled:opacity-60"
                        >
                          {updating === o.order_id ? "…" : "Verifikasi"}
                        </button>
                      )}
                      {o.status !== "cancelled" && o.status !== "verified" && (
                        <button
                          onClick={() => setStatus(o.order_id, "cancelled")}
                          disabled={updating === o.order_id}
                          className="rounded-full bg-white/70 px-3 py-1.5 text-[11px] font-semibold text-red-600 ring-1 ring-white hover:bg-white disabled:opacity-60"
                        >
                          Batal
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </main>
  );
}
