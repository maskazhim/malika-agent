"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { formatRp } from "@/lib/qris";
import { buildTransferWaLink } from "@/lib/orders";

interface ServiceLink {
  key: string;
  label: string;
  url: string;
}

interface SubOrder {
  order_id: string;
  product: string;
  amount: number;
  nama: string;
  bisnis: string;
  email: string;
  status: string;
  status_label: string;
  created_at: string;
  subdomain: string;
  promo_code: string;
  retensi_at: string;
  renewal_count: number;
  access_url: string;
  credential_sent: boolean;
  active: boolean;
  deploy_status: string;
  short_name: string;
  server_due_at: string;
  server_due_label: string;
  active_until: string;
  services: ServiceLink[];
}

const STATUS_STYLE: Record<string, string> = {
  checkout: "bg-stone-200 text-stone-600",
  payment_proof: "bg-amber-100 text-amber-800",
  verified: "bg-teal-100 text-teal-800",
  setup_server: "bg-blue-100 text-blue-800",
  onboard: "bg-indigo-100 text-indigo-800",
  retensi: "bg-emerald-100 text-emerald-800",
  churn: "bg-stone-300 text-stone-700",
  resubscribe: "bg-violet-100 text-violet-800",
  cancelled: "bg-red-100 text-red-700",
};

function expiryOf(o: SubOrder): string {
  const iso = (o.active_until || o.server_due_at || "").slice(0, 10);
  if (/^\d{4}-\d{2}-\d{2}$/.test(iso)) {
    return new Date(`${iso}T00:00:00Z`).toLocaleDateString("id-ID", { day: "numeric", month: "short", year: "numeric" });
  }
  if (!o.retensi_at) return "-";
  const exp = new Date(new Date(o.retensi_at).getTime() + 30 * 864e5);
  return exp.toLocaleDateString("id-ID", { day: "numeric", month: "short", year: "numeric" });
}

function OrderId({ id }: { id: string }) {
  const [copied, setCopied] = useState(false);
  function copy() {
    navigator.clipboard?.writeText(id).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }
  return (
    <span className="mt-0.5 flex items-center gap-1 font-mono text-[11px] text-stone-400">
      <span className="truncate" title={id}>Order {id}</span>
      <button onClick={copy} title="Salin order ID" className="shrink-0 rounded px-1 hover:bg-white hover:text-stone-700">
        {copied ? "✓" : "⧉"}
      </button>
    </span>
  );
}

/* Layanan Malika (panel shortcut + tombol akses agent) hanya tampil setelah
   set up selesai. Sebelum itu kartu hanya menunjukkan detail order + status. */
const SETUP_DONE = ["onboard", "retensi", "resubscribe"];

/* Akses Malika Agent — hanya tampil setelah set up selesai.
   URL dari API (deploy_configs.web_domain), fallback derive di server.
   Tanpa credential: customer signup sendiri saat pertama membuka URL. */
function AgentAccess({ url, deployStatus }: { url: string; deployStatus: string }) {
  const [copied, setCopied] = useState(false);
  if (!url) return null;
  const deleted = deployStatus === "deleted";

  function copy() {
    navigator.clipboard?.writeText(url).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  return (
    <div className="mt-4 rounded-2xl bg-white/60 p-3 ring-1 ring-white">
      <p className="px-1 text-[11px] font-semibold uppercase tracking-widest text-teal-700">
        Malika Agent saya
      </p>
      <div className="mt-2 flex flex-wrap items-center gap-2 rounded-xl bg-white/80 px-3 py-2.5 ring-1 ring-white">
        <code className="min-w-0 flex-1 truncate font-mono text-xs text-stone-600">
          {url.replace(/^https?:\/\//, "")}
        </code>
        {deleted ? (
          <span className="rounded-full bg-stone-200 px-3 py-1 text-[11px] font-semibold text-stone-500">
            Nonaktif
          </span>
        ) : (
          <>
            <button
              onClick={copy}
              className="shrink-0 rounded-full bg-white/70 px-3 py-1 text-[11px] font-semibold text-stone-500 ring-1 ring-stone-200 hover:bg-white"
            >
              {copied ? "Tersalin ✓" : "Salin"}
            </button>
            <a
              href={url}
              target="_blank"
              rel="noopener noreferrer"
              className="malika-gradient shrink-0 rounded-full px-5 py-1.5 text-xs font-semibold text-white hover:opacity-90"
            >
              Buka Agent →
            </a>
          </>
        )}
      </div>
      {!deleted && (
        <p className="mt-1.5 px-1 text-[11px] leading-relaxed text-stone-400">
          Pertama kali dibuka? Silakan signup / buat akun kamu langsung di halaman tersebut.
        </p>
      )}
    </div>
  );
}

export default function CustomerPage() {
  const router = useRouter();
  const [auth, setAuth] = useState<"checking" | "ok">("checking");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [view, setView] = useState<"orders" | "affiliate" | "support">("orders");
  const [orders, setOrders] = useState<SubOrder[]>([]);
  const [pics, setPics] = useState<Record<string, { username: string; name: string }>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/customer-orders");
      if (res.status === 401) {
        router.replace("/customer/login");
        return;
      }
      if (!res.ok) throw new Error("gagal");
      const data = (await res.json()) as {
        orders?: SubOrder[];
        pics?: Record<string, { username: string; name: string }>;
      };
      setOrders(data.orders ?? []);
      setPics(data.pics ?? {});
    } catch {
      setError("Gagal memuat langganan. Coba muat ulang.");
    } finally {
      setLoading(false);
    }
  }, [router]);

  useEffect(() => {
    fetch("/api/customer-auth")
      .then((r) => r.json().catch(() => null))
      .then((data: { ok?: boolean; customer?: { email: string; name: string } } | null) => {
        if (!data?.ok) router.replace("/customer/login");
        else {
          setName(data.customer?.name ?? "");
          setEmail(data.customer?.email ?? "");
          setAuth("ok");
          void load();
        }
      })
      .catch(() => router.replace("/customer/login"));
  }, [router, load]);

  async function logout() {
    await fetch("/api/customer-auth", { method: "DELETE" }).catch(() => {});
    router.replace("/customer/login");
  }

  if (auth === "checking") {
    return <main className="mx-auto max-w-4xl px-4 py-20 text-center text-sm text-stone-500">Memeriksa sesi…</main>;
  }

  return (
    <main className="mx-auto w-full max-w-4xl px-4 py-10 sm:px-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-widest text-teal-700">Malika · Customer</p>
          <h1 className="mt-1 text-3xl font-semibold tracking-tight">Langganan Saya</h1>
          {email && (
            <p className="mt-1 text-xs text-stone-500">
              {name} · {email}
            </p>
          )}
        </div>
        <button
          onClick={logout}
          className="rounded-full bg-white/70 px-5 py-2 text-sm font-semibold ring-1 ring-white hover:bg-white"
        >
          Keluar
        </button>
      </div>

      {error && (
        <p className="mt-4 rounded-xl bg-red-50 px-3 py-2 text-xs font-medium text-red-600 ring-1 ring-red-100">
          {error}
        </p>
      )}

      <div className="glass mt-5 flex gap-1 rounded-2xl p-1 text-sm font-semibold">
        {(["orders", "support", "affiliate"] as const).map((v) => (
          <button
            key={v}
            onClick={() => setView(v)}
            className={`rounded-xl px-4 py-2 transition ${
              view === v ? "malika-gradient text-white shadow" : "text-stone-500 hover:bg-white/70 hover:text-stone-900"
            }`}
          >
            {v === "orders" ? "Langganan" : v === "support" ? "Booking Support" : "Affiliate"}
          </button>
        ))}
      </div>

      {view === "affiliate" ? (
        <AffiliatePanel />
      ) : view === "support" ? (
        <SupportPanel pics={pics} orders={orders} email={email} />
      ) : loading ? (
        <p className="glass mt-5 rounded-3xl p-8 text-center text-sm text-stone-500">Memuat langganan…</p>
      ) : orders.length === 0 ? (
        <div className="glass mt-5 rounded-3xl p-8 text-center">
          <p className="text-sm text-stone-500">Belum ada langganan di email ini.</p>
          <a href="/#harga" className="malika-gradient mt-4 inline-block rounded-full px-6 py-2.5 text-sm font-semibold text-white hover:opacity-90">
            Lihat Paket Harga
          </a>
        </div>
      ) : (
        <div className="mt-5 space-y-3">
          {orders.map((o) => (
            <div key={o.order_id} className="glass-strong rounded-3xl p-6">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-base font-bold">{o.product}</p>
                  <OrderId id={o.order_id} />
                  {o.subdomain && (
                    <p className="mt-0.5 font-mono text-xs font-semibold text-teal-700">agent-{o.subdomain}.malika.ai</p>
                  )}
                </div>
                <span
                  className={`inline-block rounded-full px-2.5 py-1 text-[11px] font-semibold ${STATUS_STYLE[o.status] ?? "bg-stone-200 text-stone-600"}`}
                >
                  {o.status_label}
                </span>
              </div>
              <dl className="mt-3 space-y-1.5 text-sm">
                <div className="flex justify-between gap-3">
                  <dt className="text-stone-500">Langganan</dt>
                  <dd className="text-right font-semibold">{o.product}</dd>
                </div>
                <div className="flex justify-between gap-3">
                  <dt className="text-stone-500">Email terdaftar</dt>
                  <dd className="text-right font-medium">{o.email}</dd>
                </div>
                <div className="flex justify-between gap-3">
                  <dt className="text-stone-500">Status</dt>
                  <dd className="text-right font-medium">{o.status_label}</dd>
                </div>
                <div className="flex justify-between gap-3">
                  <dt className="text-stone-500">Total</dt>
                  <dd className="font-bold">{formatRp(o.amount)}</dd>
                </div>
                {(o.active || o.status === "retensi" || o.status === "resubscribe" || o.status === "onboard") && (
                  <div className="flex justify-between gap-3">
                    <dt className="text-stone-500">Masa aktif s/d</dt>
                    <dd className="text-right font-medium">
                      {expiryOf(o)}
                      {o.renewal_count > 0 ? ` (perpanjangan ke-${o.renewal_count})` : ""}
                      {o.server_due_at ? " · server" : ""}
                    </dd>
                  </div>
                )}
                {o.status === "checkout" && (
                  <p className="rounded-xl bg-amber-50 px-3 py-2 text-xs text-amber-700 ring-1 ring-amber-100">
                    Pembayaran belum selesai — lanjutkan pembayaran agar diproses tim Malika.
                  </p>
                )}
                {o.status === "payment_proof" && (
                  <p className="rounded-xl bg-amber-50 px-3 py-2 text-xs text-amber-700 ring-1 ring-amber-100">
                    Bukti pembayaran diterima — menunggu verifikasi tim Finance.
                  </p>
                )}
                {(o.status === "verified" || o.status === "setup_server") && (
                  <p className="rounded-xl bg-blue-50 px-3 py-2 text-xs text-blue-700 ring-1 ring-blue-100">
                    Server kamu sedang disiapkan (1-3 hari kerja termasuk greeting & onboarding). Detail akses dikirim via email.
                  </p>
                )}
                {o.status === "onboard" && (
                  <p className="rounded-xl bg-indigo-50 px-3 py-2 text-xs text-indigo-700 ring-1 ring-indigo-100">
                    Tim Malika sedang menjelaskan dashboard & fungsi agent kamu. Pantau email untuk jadwalnya.
                  </p>
                )}
              </dl>
              {SETUP_DONE.includes(o.status) && (
                <AgentAccess
                  url={(o.services ?? []).find((s) => s.key === "agent")?.url ?? ""}
                  deployStatus={o.deploy_status ?? ""}
                />
              )}
              <div className="mt-4 flex flex-wrap gap-2">
                {o.status === "checkout" ? (
                  <a
                    href={buildTransferWaLink({ order_id: o.order_id, product: o.product, amount: o.amount, nama: o.nama })}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="malika-gradient rounded-full px-5 py-2 text-xs font-semibold text-white hover:opacity-90"
                  >
                    Konfirmasi Pembayaran →
                  </a>
                ) : o.active && !SETUP_DONE.includes(o.status) ? (
                  <span className="rounded-full bg-white/70 px-5 py-2 text-xs font-semibold text-stone-500 ring-1 ring-white">
                    Akses menyusul via email
                  </span>
                ) : null}
                <a
                  href={`https://wa.me/6285124317811?text=${encodeURIComponent(`Halo Malika Agent, saya ${o.nama} (order ${o.order_id}). Mau tanya soal langganan ${o.product}.`)}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="rounded-full bg-white/70 px-5 py-2 text-xs font-semibold ring-1 ring-white hover:bg-white"
                >
                  Hubungi Support
                </a>
              </div>
            </div>
          ))}
        </div>
      )}
    </main>
  );
}

const ID_DAY = ["Min", "Sen", "Sel", "Rab", "Kam", "Jum", "Sab"];
const ID_MONTH = ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agu", "Sep", "Okt", "Nov", "Des"];

/* "YYYY-MM-DDTHH:MM" -> "Sen, 12 Okt · 09:00" (tanpa konversi zona). */
function fmtSlot(at: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(at);
  if (!m) return at;
  const wd = new Date(`${m[1]}-${m[2]}-${m[3]}T12:00:00Z`).getUTCDay();
  return `${ID_DAY[wd]}, ${Number(m[3])} ${ID_MONTH[Number(m[2]) - 1]} · ${m[4]}:${m[5]}`;
}

const BOOKING_STYLE: Record<string, string> = {
  pending: "bg-amber-100 text-amber-800",
  confirmed: "bg-teal-100 text-teal-800",
  done: "bg-stone-200 text-stone-600",
  cancelled: "bg-red-100 text-red-700",
};
const BOOKING_LABEL: Record<string, string> = {
  pending: "Menunggu konfirmasi",
  confirmed: "Terkonfirmasi",
  done: "Selesai",
  cancelled: "Batal",
};

interface SlotDay {
  date: string;
  weekday: number;
  slots: { start: string; end: string }[];
}

interface Booking {
  id: number;
  order_id: string;
  staff_username: string;
  pic_type: string;
  scheduled_at: string;
  duration_min: number;
  description: string;
  status: string;
  gmeet_url: string;
  hoptodesk_id: string;
}

const HOPTODESK_URL = "https://hoptodesk.com";

function SupportPanel({
  pics,
  orders,
  email,
}: {
  pics: Record<string, { username: string; name: string }>;
  orders: SubOrder[];
  email: string;
}) {
  const [picType, setPicType] = useState<"ai_engineer" | "account_executive">("ai_engineer");
  const [days, setDays] = useState<SlotDay[]>([]);
  const [slotMin, setSlotMin] = useState(30);
  const [slotsLoading, setSlotsLoading] = useState(false);
  const [slot, setSlot] = useState("");
  const [desc, setDesc] = useState("");
  const [orderId, setOrderId] = useState("");
  const [wantRemote, setWantRemote] = useState(false);
  const [hopId, setHopId] = useState("");
  const [hopPass, setHopPass] = useState("");
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [listLoading, setListLoading] = useState(true);
  const [listError, setListError] = useState<string | null>(null);

  const pic = pics[picType];

  const loadBookings = useCallback(async () => {
    setListLoading(true);
    setListError(null);
    try {
      const res = await fetch("/api/support-bookings");
      if (res.status === 401) {
        setListError("Sesi habis — keluar lalu login ulang ya.");
        setBookings([]);
        return;
      }
      if (!res.ok) throw new Error("gagal");
      const data = (await res.json()) as { bookings?: Booking[] };
      setBookings(data.bookings ?? []);
    } catch {
      setListError("Gagal memuat booking. Coba muat ulang.");
    } finally {
      setListLoading(false);
    }
  }, []);

  const loadSlots = useCallback(async (staff: string) => {
    if (!staff) {
      setDays([]);
      return;
    }
    setSlotsLoading(true);
    try {
      const res = await fetch(`/api/support-availability?staff=${encodeURIComponent(staff)}&slots=1&days=14`);
      if (res.ok) {
        const data = (await res.json()) as { days?: SlotDay[]; slot_minutes?: number };
        setDays(data.days ?? []);
        setSlotMin(Number(data.slot_minutes ?? 30));
      }
    } catch {
      /* abaikan */
    } finally {
      setSlotsLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadBookings();
  }, [loadBookings]);

  useEffect(() => {
    setSlot("");
    if (pic?.username) void loadSlots(pic.username);
    else setDays([]);
  }, [pic?.username, loadSlots]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!pic?.username || !slot) return;
    setSaving(true);
    setMsg(null);
    try {
      const res = await fetch("/api/support-bookings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          pic_type: picType,
          staff_username: pic.username,
          scheduled_at: slot,
          order_id: orderId || undefined,
          description: desc,
          hoptodesk_id: wantRemote ? hopId : undefined,
          hoptodesk_pass: wantRemote ? hopPass : undefined,
        }),
      });
      const data = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok || !data.ok) throw new Error(data.error ?? "gagal");
      setSlot("");
      setDesc("");
      setHopId("");
      setHopPass("");
      setWantRemote(false);
      setMsg("Booking terkirim — PIC akan konfirmasi jadwalmu.");
      void loadBookings();
      void loadSlots(pic.username);
    } catch (err) {
      setMsg(err instanceof Error ? err.message : "Gagal booking.");
    } finally {
      setSaving(false);
    }
  }

  async function cancel(id: number) {
    if (!window.confirm("Batalkan booking ini?")) return;
    try {
      const res = await fetch("/api/support-bookings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, status: "cancelled" }),
      });
      if (!res.ok) throw new Error("gagal");
      void loadBookings();
      if (pic?.username) void loadSlots(pic.username);
    } catch {
      setMsg("Gagal membatalkan.");
    }
  }

  return (
    <div className="mt-5 space-y-3">
      {msg && (
        <p className="rounded-xl bg-white/70 px-4 py-2 text-xs font-medium text-stone-600 ring-1 ring-white">{msg}</p>
      )}
      <div className="glass-strong rounded-3xl p-6">
        <h2 className="text-base font-bold">Booking Jadwal Support</h2>
        <p className="mt-1 text-xs text-stone-500">
          Pilih PIC, jam yang tersedia, lalu jelaskan kebutuhan support kamu. Durasi sesi {slotMin} menit.
        </p>
        <div className="mt-4 grid gap-2 sm:grid-cols-2">
          {(["ai_engineer", "account_executive"] as const).map((t) => {
            const p = pics[t];
            return (
              <button
                key={t}
                type="button"
                onClick={() => setPicType(t)}
                className={`rounded-2xl p-4 text-left ring-1 transition ${
                  picType === t ? "bg-teal-600 text-white ring-teal-600" : "bg-white/60 ring-white hover:bg-white"
                }`}
              >
                <p className="text-[11px] font-semibold uppercase tracking-widest opacity-70">
                  {t === "ai_engineer" ? "AI Engineer" : "Account Executive"}
                </p>
                <p className="mt-1 text-sm font-bold">{p ? p.name : "Belum ditentukan"}</p>
                {p && <p className="font-mono text-[11px] opacity-70">@{p.username}</p>}
              </button>
            );
          })}
        </div>
        {!pic ? (
          <p className="mt-4 rounded-xl bg-amber-50 px-3 py-2 text-xs text-amber-700 ring-1 ring-amber-100">
            PIC untuk peran ini belum ditentukan — hubungi support Malika.
          </p>
        ) : (
          <form onSubmit={submit} className="mt-4 space-y-3">
            {orders.length > 1 && (
              <label className="block">
                <span className="mb-1 block text-xs font-medium text-stone-500">Langganan terkait (opsional)</span>
                <select
                  value={orderId}
                  onChange={(e) => setOrderId(e.target.value)}
                  className="w-full rounded-xl border border-stone-200 bg-white/80 px-3 py-2 text-sm outline-none focus:border-teal-400"
                >
                  <option value="">— Umum (tidak spesifik order) —</option>
                  {orders.map((o) => (
                    <option key={o.order_id} value={o.order_id}>
                      {o.product} · {o.order_id.slice(0, 8)}
                    </option>
                  ))}
                </select>
              </label>
            )}
            <div>
              <p className="mb-1 text-xs font-medium text-stone-500">Pilih jadwal (14 hari ke depan)</p>
              {slotsLoading ? (
                <p className="rounded-xl bg-white/60 px-3 py-3 text-center text-xs text-stone-500 ring-1 ring-white">
                  Memuat jadwal {pic.name}…
                </p>
              ) : days.every((d) => d.slots.length === 0) ? (
                <p className="rounded-xl bg-amber-50 px-3 py-2 text-xs text-amber-700 ring-1 ring-amber-100">
                  Belum ada slot tersedia 14 hari ke depan — coba lagi nanti atau hubungi support.
                </p>
              ) : (
                <div className="max-h-64 space-y-3 overflow-y-auto rounded-2xl bg-white/60 p-3 ring-1 ring-white">
                  {days.filter((d) => d.slots.length > 0).map((d) => (
                    <div key={d.date}>
                      <p className="text-[11px] font-bold uppercase tracking-wider text-stone-400">
                        {ID_DAY[d.weekday]}, {Number(d.date.slice(8, 10))} {ID_MONTH[Number(d.date.slice(5, 7)) - 1]}
                      </p>
                      <div className="mt-1 flex flex-wrap gap-1.5">
                        {d.slots.map((s) => (
                          <button
                            key={s.start}
                            type="button"
                            onClick={() => setSlot(s.start)}
                            className={`rounded-full px-3 py-1.5 font-mono text-[11px] font-semibold transition ${
                              slot === s.start
                                ? "bg-teal-600 text-white"
                                : "bg-white ring-1 ring-stone-200 hover:ring-teal-400"
                            }`}
                          >
                            {s.start.slice(11, 16)}
                          </button>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
            <label className="block">
              <span className="mb-1 block text-xs font-medium text-stone-500">
                Kebutuhan support <span className="text-stone-400">(min. 10 karakter)</span>
              </span>
              <textarea
                value={desc}
                onChange={(e) => setDesc(e.target.value)}
                rows={3}
                placeholder="cth. Minta bantuan setting auto-reply katalog jam 9 pagi + training singkat tim CS…"
                className="w-full rounded-xl border border-stone-200 bg-white/80 px-3 py-2 text-sm outline-none focus:border-teal-400"
              />
            </label>
            <div className="rounded-2xl bg-white/60 p-3 ring-1 ring-white">
              <label className="flex items-center gap-2 text-sm font-semibold">
                <input
                  type="checkbox"
                  checked={wantRemote}
                  onChange={(e) => setWantRemote(e.target.checked)}
                  className="h-4 w-4 accent-teal-600"
                />
                Perlu remote desktop oleh AI engineer (HopToDesk)
              </label>
              {wantRemote && (
                <div className="mt-2 space-y-2">
                  <p className="text-[11px] leading-relaxed text-stone-500">
                    1. Download HopToDesk di{" "}
                    <a href={HOPTODESK_URL} target="_blank" rel="noopener noreferrer" className="font-semibold text-teal-700 underline">
                      hoptodesk.com
                    </a>{" "}
                    lalu install & buka. 2. Isi ID + password yang tampil di aplikasi ke kolom bawah.
                    ID/password hanya terlihat oleh PIC kamu dan admin.
                  </p>
                  <div className="grid gap-2 sm:grid-cols-2">
                    <label className="block">
                      <span className="mb-1 block text-[11px] font-medium text-stone-500">ID HopToDesk</span>
                      <input
                        value={hopId}
                        onChange={(e) => setHopId(e.target.value)}
                        placeholder="cth. 123 456 789"
                        className="w-full rounded-xl border border-stone-200 bg-white/80 px-3 py-2 font-mono text-sm outline-none focus:border-teal-400"
                      />
                    </label>
                    <label className="block">
                      <span className="mb-1 block text-[11px] font-medium text-stone-500">Password HopToDesk</span>
                      <input
                        value={hopPass}
                        onChange={(e) => setHopPass(e.target.value)}
                        placeholder="password sekali pakai"
                        className="w-full rounded-xl border border-stone-200 bg-white/80 px-3 py-2 font-mono text-sm outline-none focus:border-teal-400"
                      />
                    </label>
                  </div>
                </div>
              )}
            </div>
            <button
              type="submit"
              disabled={saving || !slot || desc.trim().length < 10}
              className="malika-gradient w-full rounded-full py-2.5 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-50"
            >
              {saving ? "Mengirim…" : slot ? `Booking ${fmtSlot(slot)}` : "Pilih jam dulu"}
            </button>
          </form>
        )}
      </div>
      <div className="glass-strong rounded-3xl p-6">
        <h2 className="text-base font-bold">Booking Saya</h2>
        {email && <p className="mt-0.5 text-[11px] text-stone-400">Menampilkan booking untuk {email}</p>}
        {listError && (
          <p className="mt-2 rounded-xl bg-red-50 px-3 py-2 text-xs text-red-600 ring-1 ring-red-100">{listError}</p>
        )}
        {listLoading ? (
          <p className="mt-2 text-center text-xs text-stone-500">Memuat…</p>
        ) : bookings.length === 0 ? (
          <p className="mt-2 text-xs text-stone-500">Belum ada booking.</p>
        ) : (
          <div className="mt-3 space-y-2">
            {bookings.map((b) => (
              <div key={b.id} className="rounded-2xl bg-white/60 p-3 ring-1 ring-white">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-sm font-bold">{fmtSlot(b.scheduled_at)} <span className="font-normal text-stone-400">· {b.duration_min} mnt</span></p>
                  <span className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${BOOKING_STYLE[b.status] ?? "bg-stone-200 text-stone-600"}`}>
                    {BOOKING_LABEL[b.status] ?? b.status}
                  </span>
                </div>
                <p className="mt-1 text-xs text-stone-500">
                  {b.pic_type === "ai_engineer" ? "AI Engineer" : "Account Executive"} · @{b.staff_username}
                </p>
                <p className="mt-1 text-xs text-stone-600">{b.description}</p>
                {b.gmeet_url ? (
                  <a
                    href={b.gmeet_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mt-2 inline-block rounded-full bg-teal-600 px-4 py-1.5 text-[11px] font-semibold text-white hover:bg-teal-700"
                  >
                    🎥 Join Google Meet
                  </a>
                ) : b.status === "pending" ? (
                  <p className="mt-1 text-[11px] text-stone-400">Link Meet muncul di sini setelah PIC konfirmasi.</p>
                ) : null}
                {b.hoptodesk_id ? (
                  <p className="mt-1 font-mono text-[11px] text-stone-500">HopToDesk ID: {b.hoptodesk_id} (tersimpan untuk PIC)</p>
                ) : null}
                {(b.status === "pending" || b.status === "confirmed") && (
                  <button
                    onClick={() => void cancel(b.id)}
                    className="mt-2 rounded-full bg-white px-4 py-1.5 text-[11px] font-semibold text-red-600 ring-1 ring-red-200 hover:bg-red-50"
                  >
                    Batalkan
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

interface AffTier {
  min_referrals: number;
  budget_percent: number;
}

interface AffRef {
  order_id: string;
  discount_amount: number;
  commission_amount: number;
  status: string;
  created_at: string;
}

function AffiliatePanel() {
  const [loading, setLoading] = useState(true);
  const [code, setCode] = useState<string | null>(null);
  const [discount, setDiscount] = useState(0);
  const [commission, setCommission] = useState(0);
  const [referrals, setReferrals] = useState(0);
  const [budget, setBudget] = useState(0);
  const [tiers, setTiers] = useState<AffTier[]>([]);
  const [payable, setPayable] = useState(0);
  const [paid, setPaid] = useState(0);
  const [list, setList] = useState<AffRef[]>([]);
  const [msg, setMsg] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    fetch("/api/affiliate")
      .then((r) => (r.ok ? r.json() : null))
      .then((d: {
        code?: string | null; discount_percent?: number; commission_percent?: number;
        referrals?: number; budget?: number; tiers?: AffTier[];
        payable?: number; paid?: number; referrals_list?: AffRef[];
      } | null) => {
        if (!d) return;
        setCode(d.code ?? null);
        const b = Number(d.budget ?? 0);
        setBudget(b);
        // Default split 50:50 dari budget bila kode belum ada.
        setDiscount(d.code ? Number(d.discount_percent ?? 0) : Math.floor(b / 2));
        setCommission(d.code ? Number(d.commission_percent ?? 0) : Math.ceil(b / 2));
        setReferrals(Number(d.referrals ?? 0));
        setTiers(d.tiers ?? []);
        setPayable(Number(d.payable ?? 0));
        setPaid(Number(d.paid ?? 0));
        setList(d.referrals_list ?? []);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  function onSlide(v: number) {
    const d = Math.max(0, Math.min(budget, Math.round(v)));
    setDiscount(d);
    setCommission(budget - d);
  }

  async function save() {
    setSaving(true);
    setMsg(null);
    try {
      const res = await fetch("/api/affiliate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ discount_percent: discount, commission_percent: commission }),
      });
      const data = (await res.json()) as { ok?: boolean; error?: string; code?: string; budget?: number };
      if (!res.ok || !data.ok) throw new Error(data.error ?? "gagal");
      setCode(data.code ?? code);
      setBudget(Number(data.budget ?? budget));
      // Refresh statistik.
      const r = await fetch("/api/affiliate").then((x) => (x.ok ? x.json() : null)) as {
        referrals?: number; payable?: number; paid?: number; referrals_list?: AffRef[];
      } | null;
      if (r) {
        setReferrals(Number(r.referrals ?? 0));
        setPayable(Number(r.payable ?? 0));
        setPaid(Number(r.paid ?? 0));
        setList(r.referrals_list ?? []);
      }
      setMsg(`Kode ${data.code} tersimpan — bagikan agar teman dapat diskon ${discount}%.`);
    } catch (err) {
      setMsg(err instanceof Error ? err.message : "Gagal menyimpan.");
    } finally {
      setSaving(false);
    }
  }

  function copy() {
    if (!code) return;
    navigator.clipboard?.writeText(code).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  if (loading) return <p className="glass mt-5 rounded-3xl p-8 text-center text-sm text-stone-500">Memuat affiliate…</p>;

  return (
    <div className="mt-5 space-y-3">
      {msg && <p className="rounded-xl bg-white/70 px-4 py-2 text-xs font-medium text-stone-600 ring-1 ring-white">{msg}</p>}
      <div className="glass-strong rounded-3xl p-6">
        <h2 className="text-base font-bold">Kode Affiliate Saya</h2>
        <p className="mt-1 text-xs text-stone-500">
          {referrals} referral · jatah tier kamu <span className="font-bold text-teal-700">{budget}%</span>
          {tiers.length > 0 && (
            <> ({tiers.map((t) => `${t.min_referrals}+ → ${t.budget_percent}%`).join(" · ")})</>
          )}
        </p>
        {budget <= 0 ? (
          <p className="mt-3 rounded-xl bg-amber-50 px-3 py-2 text-xs text-amber-700 ring-1 ring-amber-100">
            Program affiliate belum aktif (belum ada tier dari admin). Cek lagi nanti ya.
          </p>
        ) : (
          <>
            {code && (
              <div className="mt-3 flex items-center gap-2">
                <code className="rounded-xl bg-stone-900 px-4 py-2 font-mono text-lg font-bold tracking-widest text-white">{code}</code>
                <button onClick={copy} className="rounded-full bg-white/70 px-4 py-2 text-xs font-semibold ring-1 ring-white hover:bg-white">
                  {copied ? "Tersalin ✓" : "Salin"}
                </button>
              </div>
            )}
            <div className="mt-4">
              <div className="flex justify-between text-xs font-semibold">
                <span>Diskon untuk teman: <span className="text-teal-700">{discount}%</span></span>
                <span>Komisi saya: <span className="text-teal-700">{commission}%</span></span>
              </div>
              <input
                type="range"
                min={0}
                max={budget}
                value={discount}
                onChange={(e) => onSlide(Number(e.target.value))}
                className="mt-2 w-full accent-teal-600"
              />
              <p className="mt-1 text-[11px] text-stone-400">Geser untuk membagi jatah {budget}% antara diskon teman dan komisimu. Total harus pas {budget}%.</p>
            </div>
            <button onClick={save} disabled={saving} className="malika-gradient mt-4 rounded-full px-6 py-2 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-60">
              {saving ? "Menyimpan…" : code ? "Simpan pembagian" : "Buat kode affiliate"}
            </button>
          </>
        )}
      </div>
      <div className="glass-strong rounded-3xl p-6">
        <h2 className="text-base font-bold">Penghasilan Affiliate</h2>
        <div className="mt-3 grid grid-cols-3 gap-2 text-center">
          <div className="rounded-2xl bg-white/60 p-3 ring-1 ring-white">
            <p className="text-xl font-bold">{referrals}</p>
            <p className="text-[11px] text-stone-500">Referral</p>
          </div>
          <div className="rounded-2xl bg-white/60 p-3 ring-1 ring-white">
            <p className="text-xl font-bold text-teal-700">{formatRp(payable)}</p>
            <p className="text-[11px] text-stone-500">Bisa dicairkan</p>
          </div>
          <div className="rounded-2xl bg-white/60 p-3 ring-1 ring-white">
            <p className="text-xl font-bold">{formatRp(paid)}</p>
            <p className="text-[11px] text-stone-500">Sudah cair</p>
          </div>
        </div>
        {list.length > 0 && (
          <table className="mt-4 w-full text-left text-xs">
            <thead>
              <tr className="border-b border-white/70 uppercase tracking-wider text-stone-400">
                <th className="px-2 py-2 font-semibold">Order</th>
                <th className="px-2 py-2 font-semibold">Diskon teman</th>
                <th className="px-2 py-2 font-semibold">Komisi</th>
                <th className="px-2 py-2 font-semibold">Status</th>
              </tr>
            </thead>
            <tbody>
              {list.map((r) => (
                <tr key={r.order_id} className="border-b border-white/50 last:border-0">
                  <td className="px-2 py-2 font-mono">{r.order_id.slice(0, 8)}…</td>
                  <td className="px-2 py-2">{formatRp(r.discount_amount)}</td>
                  <td className="px-2 py-2 font-semibold text-teal-700">{formatRp(r.commission_amount)}</td>
                  <td className="px-2 py-2">{r.status === "paid" ? "Cair ✓" : "Menunggu"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
