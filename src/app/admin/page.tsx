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
  const [view, setView] = useState<"orders" | "pricing" | "logs">("orders");
  const [orders, setOrders] = useState<Order[]>([]);
  const [filter, setFilter] = useState("");
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);
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

  async function removeOrder(order_id: string) {
    if (!window.confirm("Hapus order ini permanen? Kode uniknya ikut dibebaskan.")) return;
    setDeleting(order_id);
    try {
      const res = await fetch(`/api/orders?order_id=${encodeURIComponent(order_id)}`, { method: "DELETE" });
      if (res.status === 401) {
        router.replace("/login");
        return;
      }
      if (!res.ok) throw new Error("gagal");
      setOrders((os) => os.filter((o) => o.order_id !== order_id));
    } catch {
      setError("Gagal menghapus order.");
    } finally {
      setDeleting(null);
    }
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
        {(["orders", "pricing", "logs"] as const).map((v) => (
          <button
            key={v}
            onClick={() => setView(v)}
            className={`rounded-xl px-4 py-2 transition ${
              view === v ? "malika-gradient text-white shadow" : "text-stone-500 hover:bg-white/70 hover:text-stone-900"
            }`}
          >
            {v === "orders" ? "Order" : v === "pricing" ? "Harga Paket" : "Log Pembayaran"}
          </button>
        ))}
      </div>

      {view === "pricing" ? (
        <PricingManager />
      ) : view === "logs" ? (
        <PaymentLogs />
      ) : (
        <>
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
                      <button
                        onClick={() => removeOrder(o.order_id)}
                        disabled={deleting === o.order_id}
                        className="rounded-full bg-white/70 px-3 py-1.5 text-[11px] font-semibold text-stone-500 ring-1 ring-white hover:bg-red-50 hover:text-red-600 disabled:opacity-60"
                      >
                        {deleting === o.order_id ? "…" : "Hapus"}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
        </>
      )}
    </main>
  );
}

interface PayLog {
  id: number;
  received_at: string;
  from_addr: string;
  subject: string;
  parsed_amounts: string;
  matched_order: string;
  action: string;
  note: string;
}

const LOG_STYLE: Record<string, string> = {
  verified: "bg-teal-100 text-teal-800",
  needs_review: "bg-amber-100 text-amber-800",
  ignored: "bg-stone-200 text-stone-600",
};

const LOG_FILTERS = [
  { key: "", label: "Semua" },
  { key: "verified", label: "Terverifikasi" },
  { key: "needs_review", label: "Perlu review" },
  { key: "ignored", label: "Diabaikan" },
];

function PaymentLogs() {
  const [logs, setLogs] = useState<PayLog[]>([]);
  const [filter, setFilter] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (action: string) => {
    setLoading(true);
    setError(null);
    try {
      const url = action ? `/api/payment-logs?action=${encodeURIComponent(action)}` : "/api/payment-logs";
      const res = await fetch(url);
      if (!res.ok) throw new Error("gagal");
      const data = (await res.json()) as { logs?: PayLog[] };
      setLogs(data.logs ?? []);
    } catch {
      setError("Gagal memuat log. Coba muat ulang.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load("");
  }, [load]);

  function changeFilter(key: string) {
    setFilter(key);
    void load(key);
  }

  function fmtAmounts(raw: string): string {
    try {
      const arr: unknown = JSON.parse(raw);
      if (!Array.isArray(arr) || arr.length === 0) return "-";
      return arr.map((n) => formatRp(Number(n))).join(", ");
    } catch {
      return "-";
    }
  }

  return (
    <div className="mt-4">
      <div className="glass flex flex-wrap gap-1 rounded-2xl p-1 text-sm font-semibold">
        {LOG_FILTERS.map((f) => (
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
        <p className="mt-4 rounded-xl bg-red-50 px-3 py-2 text-xs font-medium text-red-600 ring-1 ring-red-100">{error}</p>
      )}
      <div className="glass-strong mt-4 overflow-x-auto rounded-3xl">
        {loading ? (
          <p className="p-8 text-center text-sm text-stone-500">Memuat log…</p>
        ) : logs.length === 0 ? (
          <p className="p-8 text-center text-sm text-stone-500">
            Belum ada email diproses. Forward notifikasi pembayaran ke alamat Email Routing worker untuk mulai mencatat.
          </p>
        ) : (
          <table className="w-full min-w-3xl text-left text-sm">
            <thead>
              <tr className="border-b border-white/70 text-xs uppercase tracking-wider text-stone-400">
                <th className="px-4 py-3 font-semibold">Waktu</th>
                <th className="px-4 py-3 font-semibold">Email</th>
                <th className="px-4 py-3 font-semibold">Nominal terdeteksi</th>
                <th className="px-4 py-3 font-semibold">Order cocok</th>
                <th className="px-4 py-3 font-semibold">Aksi</th>
              </tr>
            </thead>
            <tbody>
              {logs.map((l) => (
                <tr key={l.id} className="border-b border-white/50 last:border-0 hover:bg-white/40">
                  <td className="px-4 py-3 text-xs text-stone-500">
                    {l.received_at ? new Date(l.received_at).toLocaleString("id-ID") : "-"}
                  </td>
                  <td className="px-4 py-3">
                    <p className="max-w-55 truncate text-xs font-medium">{l.subject || "(tanpa subjek)"}</p>
                    <p className="max-w-55 truncate text-[11px] text-stone-400">{l.from_addr}</p>
                    {l.note && <p className="mt-0.5 max-w-55 truncate text-[11px] text-stone-500">{l.note}</p>}
                  </td>
                  <td className="px-4 py-3 text-xs font-medium">{fmtAmounts(l.parsed_amounts)}</td>
                  <td className="px-4 py-3 font-mono text-[11px]">
                    {l.matched_order ? l.matched_order.slice(0, 8) + "…" : "-"}
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`inline-block rounded-full px-2.5 py-1 text-[11px] font-semibold ${LOG_STYLE[l.action] ?? "bg-stone-200 text-stone-600"}`}
                    >
                      {l.action === "verified" ? "Terverifikasi" : l.action === "needs_review" ? "Perlu review" : "Diabaikan"}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

interface PlanRow {
  key: string;
  name: string;
  price: number;  period: string;
  description: string;
  features: string[];
  cta: string;
  popular: boolean;
}

function PricingManager() {
  const [plans, setPlans] = useState<PlanRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/pricing")
      .then((r) => (r.ok ? r.json() : null))
      .then((data: { plans?: PlanRow[] } | null) => setPlans(data?.plans ?? []))
      .catch(() => setMsg("Gagal memuat harga paket."))
      .finally(() => setLoading(false));
  }, []);

  function edit(key: string, patch: Partial<PlanRow>) {
    setPlans((ps) => ps.map((p) => (p.key === key ? { ...p, ...patch } : p)));
  }

  async function save(p: PlanRow) {
    const price = Math.round(Number(p.price));
    if (!price || price <= 0) {
      setMsg(`Harga ${p.name} harus angka > 0.`);
      return;
    }
    setSaving(p.key);
    setMsg(null);
    try {
      const res = await fetch("/api/pricing", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          key: p.key,
          price,
          description: p.description,
          features: p.features,
          cta: p.cta,
          popular: p.popular,
        }),
      });
      if (!res.ok) throw new Error("gagal");
      setMsg(`${p.name} tersimpan — halaman #harga ikut update otomatis.`);
    } catch {
      setMsg(`Gagal menyimpan ${p.name}.`);
    } finally {
      setSaving(null);
    }
  }

  if (loading) return <p className="p-8 text-center text-sm text-stone-500">Memuat harga paket…</p>;

  return (
    <div className="mt-4 space-y-3">
      {msg && (
        <p className="rounded-xl bg-white/70 px-4 py-2 text-xs font-medium text-stone-600 ring-1 ring-white">{msg}</p>
      )}
      {plans.map((p) => (
        <div key={p.key} className="glass-strong rounded-3xl p-6">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-lg font-bold">
              {p.name} <span className="text-xs font-normal text-stone-400">({p.key})</span>
            </h2>
            <label className="flex items-center gap-2 text-xs font-semibold text-stone-600">
              <input
                type="checkbox"
                checked={p.popular}
                onChange={(e) => edit(p.key, { popular: e.target.checked })}
                className="h-4 w-4 accent-teal-600"
              />
              Paling Populer
            </label>
          </div>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <label className="block">
              <span className="mb-1 block text-xs font-medium text-stone-500">Harga (Rp, angka saja)</span>
              <input
                type="number"
                min={1}
                value={p.price}
                onChange={(e) => edit(p.key, { price: Number(e.target.value) })}
                className="w-full rounded-xl border border-stone-200 bg-white/80 px-3 py-2 text-sm outline-none focus:border-teal-400"
              />
            </label>
            <label className="block">
              <span className="mb-1 block text-xs font-medium text-stone-500">Tombol CTA</span>
              <input
                value={p.cta}
                onChange={(e) => edit(p.key, { cta: e.target.value })}
                className="w-full rounded-xl border border-stone-200 bg-white/80 px-3 py-2 text-sm outline-none focus:border-teal-400"
              />
            </label>
            <label className="block sm:col-span-2">
              <span className="mb-1 block text-xs font-medium text-stone-500">Deskripsi</span>
              <input
                value={p.description}
                onChange={(e) => edit(p.key, { description: e.target.value })}
                className="w-full rounded-xl border border-stone-200 bg-white/80 px-3 py-2 text-sm outline-none focus:border-teal-400"
              />
            </label>
            <label className="block sm:col-span-2">
              <span className="mb-1 block text-xs font-medium text-stone-500">Fitur (satu per baris)</span>
              <textarea
                rows={Math.min(12, Math.max(4, p.features.length + 1))}
                value={p.features.join("\n")}
                onChange={(e) =>
                  edit(p.key, { features: e.target.value.split("\n").map((s) => s.trim()).filter(Boolean) })
                }
                className="w-full rounded-xl border border-stone-200 bg-white/80 px-3 py-2 text-sm outline-none focus:border-teal-400"
              />
            </label>
          </div>
          <button
            onClick={() => save(p)}
            disabled={saving === p.key}
            className="malika-gradient mt-4 rounded-full px-6 py-2 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-60"
          >
            {saving === p.key ? "Menyimpan…" : `Simpan ${p.name}`}
          </button>
        </div>
      ))}
    </div>
  );
}
