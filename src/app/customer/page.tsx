"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { formatRp } from "@/lib/qris";

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
  if (!o.retensi_at) return "-";
  const exp = new Date(new Date(o.retensi_at).getTime() + 30 * 864e5);
  return exp.toLocaleDateString("id-ID", { day: "numeric", month: "short", year: "numeric" });
}

/* Shortcut 4 layanan Malika (Agent, Router, Connector, Gowa).
   URL dari API (deploy_configs), fallback derive sudah dihitung di server.
   Gowa yang masih rencana tetap tampil (URL derivasi). */
function ServiceShortcuts({ services, deployStatus }: { services: ServiceLink[]; deployStatus: string }) {
  const [copied, setCopied] = useState<string | null>(null);
  if (!services || services.length === 0) return null;
  const deleted = deployStatus === "deleted";

  function copy(url: string, key: string) {
    navigator.clipboard?.writeText(url).catch(() => {});
    setCopied(key);
    setTimeout(() => setCopied(null), 1500);
  }

  return (
    <div className="mt-4 rounded-2xl bg-white/60 p-3 ring-1 ring-white">
      <p className="px-1 text-[11px] font-semibold uppercase tracking-widest text-teal-700">
        Layanan Malika saya
      </p>
      <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
        {services.map((s) => (
          <div key={s.key} className="rounded-xl bg-white/80 px-3 py-2 ring-1 ring-white">
            <div className="flex items-center justify-between gap-2">
              <p className="text-xs font-bold">{s.label}</p>
              {deleted ? (
                <span className="rounded-full bg-stone-200 px-2.5 py-0.5 text-[11px] font-semibold text-stone-500">
                  Nonaktif
                </span>
              ) : s.url ? (
                <a
                  href={s.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="rounded-full bg-teal-600 px-3 py-1 text-[11px] font-semibold text-white hover:bg-teal-700"
                >
                  Buka →
                </a>
              ) : (
                <span className="rounded-full bg-amber-100 px-2.5 py-0.5 text-[11px] font-semibold text-amber-700">
                  Menyusul
                </span>
              )}
            </div>
            {s.url && !deleted ? (
              <div className="mt-1 flex items-center gap-1.5">
                <code className="min-w-0 flex-1 truncate font-mono text-[11px] text-stone-500">
                  {s.url.replace(/^https?:\/\//, "")}
                </code>
                <button
                  onClick={() => copy(s.url, s.key)}
                  className="shrink-0 rounded-full bg-white/70 px-2 py-0.5 text-[11px] font-semibold text-stone-500 ring-1 ring-stone-200 hover:bg-white"
                >
                  {copied === s.key ? "✓" : "Salin"}
                </button>
              </div>
            ) : null}
          </div>
        ))}
      </div>
    </div>
  );
}

export default function CustomerPage() {
  const router = useRouter();
  const [auth, setAuth] = useState<"checking" | "ok">("checking");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [view, setView] = useState<"orders" | "affiliate">("orders");
  const [orders, setOrders] = useState<SubOrder[]>([]);
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
      const data = (await res.json()) as { orders?: SubOrder[] };
      setOrders(data.orders ?? []);
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
        {(["orders", "affiliate"] as const).map((v) => (
          <button
            key={v}
            onClick={() => setView(v)}
            className={`rounded-xl px-4 py-2 transition ${
              view === v ? "malika-gradient text-white shadow" : "text-stone-500 hover:bg-white/70 hover:text-stone-900"
            }`}
          >
            {v === "orders" ? "Langganan" : "Affiliate"}
          </button>
        ))}
      </div>

      {view === "affiliate" ? (
        <AffiliatePanel />
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
                <div>
                  <p className="text-base font-bold">{o.product}</p>
                  <p className="mt-0.5 font-mono text-[11px] text-stone-400">Order {o.order_id.slice(0, 8)}…</p>
                  {o.subdomain && (
                    <p className="mt-0.5 font-mono text-xs font-semibold text-teal-700">{o.subdomain}.malika.ai</p>
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
                  <dt className="text-stone-500">Total</dt>
                  <dd className="font-bold">{formatRp(o.amount)}</dd>
                </div>
                {(o.status === "retensi" || o.status === "resubscribe") && (
                  <div className="flex justify-between gap-3">
                    <dt className="text-stone-500">Aktif s/d</dt>
                    <dd className="font-medium">
                      {expiryOf(o)}
                      {o.renewal_count > 0 ? ` (perpanjangan ke-${o.renewal_count})` : ""}
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
              {(o.short_name || o.subdomain || (o.services ?? []).some((s) => s.url)) && (
                <ServiceShortcuts services={o.services ?? []} deployStatus={o.deploy_status ?? ""} />
              )}
              <div className="mt-4 flex flex-wrap gap-2">
                {o.credential_sent && o.access_url ? (
                  <a
                    href={o.access_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="malika-gradient rounded-full px-5 py-2 text-xs font-semibold text-white hover:opacity-90"
                  >
                    Buka Malika Agent Saya →
                  </a>
                ) : o.active ? (
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
