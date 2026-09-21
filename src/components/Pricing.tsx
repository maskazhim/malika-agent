"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { PRICING } from "@/data/demo";
import { formatRp } from "@/lib/qris";
import { newOrderId, saveOrder } from "@/lib/orders";

const FALLBACK_AMOUNTS: Record<string, number> = {
  Starter: 1799000,
  Growth: 4599000,
  Scale: 10999000,
};

interface Plan {
  key: string;
  name: string;
  priceInt: number;
  period: string;
  desc: string;
  features: string[];
  cta: string;
  popular: boolean;
}

function fallbackPlans(): Plan[] {
  return PRICING.map((p) => ({
    key: p.name.toLowerCase(),
    name: p.name,
    priceInt: FALLBACK_AMOUNTS[p.name] ?? 0,
    period: p.period,
    desc: p.desc,
    features: p.features,
    cta: p.cta,
    popular: p.popular,
  }));
}

interface FormState {
  nama: string;
  bisnis: string;
  telepon: string;
  email: string;
}

export default function Pricing() {
  const router = useRouter();
  const [plans, setPlans] = useState<Plan[]>(fallbackPlans);
  const [open, setOpen] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>({ nama: "", bisnis: "", telepon: "", email: "" });
  const [error, setError] = useState<string | null>(null);

  // Harga live dari /api/pricing (bisa diubah via dashboard admin).
  // Gagal fetch → tetap pakai data statis di atas.
  useEffect(() => {
    interface ApiPlan {
      key: string;
      name: string;
      price: number;
      period: string;
      description: string;
      features: string[];
      cta: string;
      popular: boolean;
    }
    fetch("/api/pricing")
      .then((r) => (r.ok ? r.json() : null))
      .then((data: { plans?: ApiPlan[] } | null) => {
        if (!data?.plans || data.plans.length === 0) return;
        setPlans(
          data.plans.map((p) => ({
            key: String(p.key),
            name: String(p.name),
            priceInt: Math.round(Number(p.price ?? 0)) || 0,
            period: String(p.period ?? "/bulan"),
            desc: String(p.description ?? ""),
            features: Array.isArray(p.features) ? p.features.map(String) : [],
            cta: String(p.cta ?? ""),
            popular: Boolean(p.popular),
          }))
        );
      })
      .catch(() => {});
  }, []);

  const active = plans.find((p) => p.key === open) ?? null;

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const f = {
      nama: form.nama.trim(),
      bisnis: form.bisnis.trim(),
      telepon: form.telepon.trim(),
      email: form.email.trim(),
    };
    if (!f.nama || !f.bisnis || !f.telepon || !f.email) {
      setError("Lengkapi semua field dulu ya.");
      return;
    }
    if (!/^[+0-9][0-9\s-]{7,}$/.test(f.telepon)) {
      setError("Nomor telepon tidak valid.");
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(f.email)) {
      setError("Email tidak valid.");
      return;
    }
    if (!active || !active.priceInt) {
      setError("Paket tidak valid.");
      return;
    }
    setError(null);
    const order_id = newOrderId();
    const q = new URLSearchParams({
      product: active.name,
      amount: String(active.priceInt),
      order_id,
      ...f,
    });
    // Simpan order tahap checkout ke D1 (fallback localStorage bila API belum siap).
    void saveOrder({
      order_id,
      product: active.name,
      amount: active.priceInt,
      ...f,
      status: "checkout",
    });
    setOpen(null);
    router.push(`/payment?${q.toString()}`);
  }

  const set = (k: keyof FormState) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((s) => ({ ...s, [k]: e.target.value }));

  return (
    <section id="harga" className="mx-auto max-w-6xl scroll-mt-20 px-4 py-12 sm:px-6">
      <h2 className="text-center text-3xl font-semibold tracking-tight sm:text-4xl">Paket Harga</h2>
      <p className="mx-auto mt-3 max-w-2xl text-center text-sm text-stone-600 sm:text-base">
        Bayar bulanan via QRIS / Transfer Bank. Klik pilih — isi form — lanjut ke
        halaman pembayaran.
      </p>
      <div className="mt-8 grid gap-4 lg:grid-cols-3">
        {plans.map((p) => (
          <div
            key={p.key}
            className={`glass relative flex flex-col rounded-3xl p-7 transition hover:-translate-y-1 ${
              p.popular ? "ring-2 ring-teal-400" : ""
            }`}
          >
            {p.popular && (
              <span className="malika-gradient absolute -top-3 left-1/2 -translate-x-1/2 rounded-full px-3 py-1 text-xs font-bold text-white">
                Paling Populer
              </span>
            )}
            <p className="text-sm font-semibold text-teal-700">{p.name}</p>
            <p className="mt-2 text-3xl font-bold tracking-tight">
              {formatRp(p.priceInt)}
              <span className="text-sm font-normal text-stone-500">{p.period}</span>
            </p>
            <p className="mt-2 text-sm text-stone-600">{p.desc}</p>
            <ul className="mt-5 flex-1 space-y-2.5 text-sm">
              {p.features.map((f) => (
                <li key={f} className="flex gap-2">
                  <span className="text-teal-600">✓</span>
                  <span className="text-stone-700">{f}</span>
                </li>
              ))}
            </ul>
            <button
              onClick={() => {
                setOpen(p.key);
                setError(null);
              }}
              className={`mt-6 rounded-full px-5 py-2.5 text-center text-sm font-semibold transition hover:opacity-90 ${
                p.popular ? "malika-gradient text-white" : "bg-stone-900 text-white hover:bg-stone-700"
              }`}
            >
              {p.cta}
            </button>
          </div>
        ))}
      </div>

      {active && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-stone-950/40 p-4 backdrop-blur-sm" onClick={() => setOpen(null)}>
          <div
            className="glass-strong feed-in w-full max-w-md rounded-3xl p-7"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between">
              <div>
                <p className="text-xs font-semibold uppercase tracking-widest text-teal-700">Checkout</p>
                <h3 className="mt-1 text-xl font-bold">
                  {active.name} · {formatRp(active.priceInt)}
                  <span className="text-sm font-normal text-stone-500">{active.period}</span>
                </h3>
      </div>

      <p className="mx-auto mt-8 max-w-3xl text-center text-xs leading-relaxed text-stone-500">
        Biaya penggunaan token AI menyesuaikan beban pekerjaan yang diberikan. Biaya Malika adalah biaya layanan
        dan kredit AI. Anda bisa top up kredit AI Malika atau hubungkan ke langganan ChatGPT, Grok, atau Claude
        yang Anda miliki untuk tambahan kredit AI.
      </p>
              <button onClick={() => setOpen(null)} className="rounded-lg bg-white/70 px-2.5 py-1 text-sm ring-1 ring-white hover:bg-white" aria-label="Tutup">✕</button>
            </div>
            <form onSubmit={submit} className="mt-5 space-y-3">
              <label className="block">
                <span className="mb-1 block text-xs font-medium text-stone-500">Produk dipilih</span>
                <input value={active.name} disabled className="w-full rounded-xl border border-stone-200 bg-stone-100 px-3 py-2 text-sm text-stone-500 outline-none" />
              </label>
              {(
                [
                  ["nama", "Nama lengkap", "cth. Budi Santoso"],
                  ["bisnis", "Nama bisnis", "cth. Kopi Nusantara"],
                  ["telepon", "Nomor telepon / WA", "cth. 081234567890"],
                  ["email", "Email", "cth. budi@bisnis.com"],
                ] as [keyof FormState, string, string][]
              ).map(([k, label, ph]) => (
                <label key={k} className="block">
                  <span className="mb-1 block text-xs font-medium text-stone-500">{label}</span>
                  <input
                    value={form[k]}
                    onChange={set(k)}
                    placeholder={ph}
                    type={k === "email" ? "email" : k === "telepon" ? "tel" : "text"}
                    className="w-full rounded-xl border border-stone-200 bg-white/80 px-3 py-2 text-sm outline-none focus:border-teal-400"
                  />
                </label>
              ))}
              {error && <p className="rounded-xl bg-red-50 px-3 py-2 text-xs font-medium text-red-600 ring-1 ring-red-100">{error}</p>}
              <button type="submit" className="malika-gradient w-full rounded-full py-2.5 text-sm font-semibold text-white transition hover:opacity-90">
                Lanjut ke Pembayaran →
              </button>
            </form>
          </div>
        </div>
      )}
    </section>
  );
}
