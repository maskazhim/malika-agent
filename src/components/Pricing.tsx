"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { PRICING } from "@/data/demo";
import { formatRp } from "@/lib/qris";

const AMOUNTS: Record<string, number> = {
  Starter: 1799000,
  Growth: 4599000,
  Scale: 10999000,
};

interface FormState {
  nama: string;
  bisnis: string;
  telepon: string;
  email: string;
}

export default function Pricing() {
  const router = useRouter();
  const [open, setOpen] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>({ nama: "", bisnis: "", telepon: "", email: "" });
  const [error, setError] = useState<string | null>(null);

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
    setError(null);
    const q = new URLSearchParams({
      product: open ?? "",
      amount: String(AMOUNTS[open ?? ""] ?? 0),
      ...f,
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
        Bayar bulanan via QRIS. Klik pilih — isi form — langsung dapat QR dengan nominal
        yang sudah disesuaikan.
      </p>
      <div className="mt-8 grid gap-4 lg:grid-cols-3">
        {PRICING.map((p) => (
          <div
            key={p.name}
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
              {p.price}
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
                setOpen(p.name);
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

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-stone-950/40 p-4 backdrop-blur-sm" onClick={() => setOpen(null)}>
          <div
            className="glass-strong feed-in w-full max-w-md rounded-3xl p-7"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between">
              <div>
                <p className="text-xs font-semibold uppercase tracking-widest text-teal-700">Checkout</p>
                <h3 className="mt-1 text-xl font-bold">
                  {open} · {formatRp(AMOUNTS[open] ?? 0)}
                  <span className="text-sm font-normal text-stone-500">/bulan</span>
                </h3>
              </div>
              <button onClick={() => setOpen(null)} className="rounded-lg bg-white/70 px-2.5 py-1 text-sm ring-1 ring-white hover:bg-white" aria-label="Tutup">✕</button>
            </div>
            <form onSubmit={submit} className="mt-5 space-y-3">
              <label className="block">
                <span className="mb-1 block text-xs font-medium text-stone-500">Produk dipilih</span>
                <input value={open} disabled className="w-full rounded-xl border border-stone-200 bg-stone-100 px-3 py-2 text-sm text-stone-500 outline-none" />
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
                Lanjut ke Pembayaran QRIS →
              </button>
            </form>
          </div>
        </div>
      )}
    </section>
  );
}
