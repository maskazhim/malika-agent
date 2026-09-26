"use client";

import { useEffect, useState } from "react";
import { PRICING } from "@/data/demo";
import { formatRp } from "@/lib/qris";
import { calcDiscount, DURATIONS, durationLabel, type PromoCheck } from "@/lib/orders";

const FALLBACK_AMOUNTS: Record<string, number> = {
  Starter: 1799000,
  Growth: 4599000,
  Scale: 10999000,
};

interface Plan {
  key: string;
  name: string;
  priceInt: number;
  desc: string;
  features: string[];
}

function fallbackPlans(): Plan[] {
  return PRICING.map((p) => ({
    key: p.name.toLowerCase(),
    name: p.name,
    priceInt: FALLBACK_AMOUNTS[p.name] ?? 0,
    desc: p.desc,
    features: p.features,
  }));
}

function formatExpiry(iso: string): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("id-ID", { day: "numeric", month: "short", year: "numeric" });
}

export default function SimulasiHarga() {
  const [plans, setPlans] = useState<Plan[]>(fallbackPlans);
  const [planKey, setPlanKey] = useState<string>(() => fallbackPlans()[0]?.key ?? "");
  const [months, setMonths] = useState<number>(1);
  const [promoInput, setPromoInput] = useState("");
  const [promo, setPromo] = useState<PromoCheck | null>(null);
  const [promoMsg, setPromoMsg] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);

  // Harga live dari /api/pricing (sama seperti halaman checkout customer).
  useEffect(() => {
    fetch("/api/pricing")
      .then((r) => (r.ok ? r.json() : null))
      .then(
        (
          data: {
            plans?: {
              key: unknown;
              name: unknown;
              price: unknown;
              description?: unknown;
              features?: unknown;
            }[];
          } | null
        ) => {
          if (!data?.plans || data.plans.length === 0) return;
          setPlans(
            data.plans.map((p) => ({
              key: String(p.key),
              name: String(p.name),
              priceInt: Math.round(Number(p.price ?? 0)) || 0,
              desc: String(p.description ?? ""),
              features: Array.isArray(p.features) ? p.features.map(String) : [],
            }))
          );
        }
      )
      .catch(() => {});
  }, []);

  const plan = plans.find((p) => p.key === planKey) ?? plans[0];
  const subtotal = (plan?.priceInt ?? 0) * months;
  const discount = promo && plan ? calcDiscount(promo, subtotal) : 0;
  const total = Math.max(0, subtotal - discount);

  async function applyPromo() {
    const code = promoInput.trim().toUpperCase();
    if (!code) return;
    setChecking(true);
    setPromoMsg(null);
    try {
      const res = await fetch(`/api/promos?code=${encodeURIComponent(code)}`);
      const data = (await res.json().catch(() => null)) as
        | (PromoCheck & { ok?: boolean; error?: string })
        | null;
      if (!res.ok || !data?.ok) {
        setPromo(null);
        setPromoMsg(data?.error ?? "Kode promo tidak valid.");
      } else {
        setPromo({
          code: String(data.code),
          type: String(data.type),
          value: Number(data.value),
          expires_at: String(data.expires_at ?? ""),
          max_uses: Number(data.max_uses ?? 0),
          used_count: Number(data.used_count ?? 0),
          remaining:
            data.remaining === null || data.remaining === undefined ? null : Number(data.remaining),
        });
        setPromoMsg(null);
      }
    } catch {
      setPromo(null);
      setPromoMsg("Gagal memeriksa kode promo. Coba lagi.");
    } finally {
      setChecking(false);
    }
  }

  function resetPromo() {
    setPromoInput("");
    setPromo(null);
    setPromoMsg(null);
  }

  return (
    <div className="mt-4 grid gap-4 lg:grid-cols-2">
      <div className="glass-strong rounded-3xl p-6">
        <p className="text-xs font-semibold uppercase tracking-widest text-teal-700">Input simulasi</p>

        <span className="mb-1 mt-4 block text-xs font-medium text-stone-500">Paket</span>
        <div className="grid grid-cols-3 gap-1 rounded-xl bg-white/50 p-1" role="tablist" aria-label="Pilih paket">
          {plans.map((p) => (
            <button
              key={p.key}
              onClick={() => setPlanKey(p.key)}
              role="tab"
              aria-selected={plan?.key === p.key}
              className={`rounded-lg px-2 py-2 text-center transition ${
                plan?.key === p.key
                  ? "malika-gradient text-white shadow"
                  : "text-stone-500 hover:bg-white/70 hover:text-stone-900"
              }`}
            >
              <span className="block text-sm font-semibold">{p.name}</span>
              <span
                className={`block text-[11px] font-normal ${
                  plan?.key === p.key ? "text-white/80" : "text-stone-400"
                }`}
              >
                {formatRp(p.priceInt)}/bln
              </span>
            </button>
          ))}
        </div>

        {plan && (
          <div className="mt-2 rounded-2xl bg-white/60 p-3 ring-1 ring-white">
            <p className="text-sm font-semibold text-stone-900">
              {plan.name} · {formatRp(plan.priceInt)}/bulan
            </p>
            {plan.desc && <p className="mt-0.5 text-xs text-stone-500">{plan.desc}</p>}
            {plan.features.length > 0 && (
              <ul className="mt-2 space-y-1 text-xs text-stone-600">
                {plan.features.map((f) => (
                  <li key={f} className="flex gap-1.5">
                    <span className="text-teal-600">✓</span>
                    <span>{f}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}

        <span className="mb-1 mt-4 block text-xs font-medium text-stone-500">Masa langganan</span>
        <div className="grid grid-cols-3 gap-1 rounded-xl bg-white/50 p-1">
          {DURATIONS.map((m) => (
            <button
              key={m}
              onClick={() => setMonths(m)}
              className={`rounded-lg px-2 py-2 text-sm font-semibold transition ${
                months === m ? "malika-gradient text-white shadow" : "text-stone-500 hover:bg-white/70 hover:text-stone-900"
              }`}
            >
              {durationLabel(m)}
            </button>
          ))}
        </div>

        <span className="mb-1 mt-4 block text-xs font-medium text-stone-500">Kode promo (opsional)</span>
        {promo ? (
          <div>
            <div className="flex items-center justify-between gap-2 rounded-xl bg-white/60 px-3 py-2 ring-1 ring-white">
              <p className="text-sm">
                <span className="font-bold text-teal-700">{promo.code}</span>
                <span className="text-stone-500">
                  {" "}
                  · {promo.type === "fixed" ? `potongan ${formatRp(promo.value)}` : `${promo.value}%`}
                </span>
              </p>
              <button onClick={resetPromo} className="text-xs font-semibold text-stone-400 hover:text-red-600">
                Hapus
              </button>
            </div>
            {(promo.expires_at || (promo.max_uses ?? 0) > 0) && (
              <p className="mt-1 text-[11px] leading-relaxed text-stone-500">
                {promo.expires_at && <>Berlaku sampai {formatExpiry(promo.expires_at)}.</>}
                {promo.expires_at && (promo.max_uses ?? 0) > 0 && " "}
                {(promo.max_uses ?? 0) > 0 && (
                  <>Sisa kuota {promo.remaining ?? Math.max(0, (promo.max_uses ?? 0) - (promo.used_count ?? 0))} dari {promo.max_uses}.</>
                )}
              </p>
            )}
          </div>
        ) : (
          <div>
            <div className="flex gap-2">
              <input
                value={promoInput}
                onChange={(e) => setPromoInput(e.target.value.toUpperCase())}
                onKeyDown={(e) => {
                  if (e.key === "Enter") applyPromo();
                }}
                placeholder="cth. HEMAT20"
                className="w-full rounded-xl border border-stone-200 bg-white/80 px-3 py-2 text-sm uppercase outline-none focus:border-teal-400"
              />
              <button
                onClick={applyPromo}
                disabled={checking || !promoInput.trim()}
                className="shrink-0 rounded-xl bg-stone-900 px-4 py-2 text-xs font-semibold text-white hover:bg-stone-700 disabled:opacity-50"
              >
                {checking ? "…" : "Cek"}
              </button>
            </div>
            <p className="mt-1 text-[11px] leading-relaxed text-stone-400">
              Kode voucher mungkin memiliki masa berlaku atau maksimal penggunaan per customer.
            </p>
          </div>
        )}
        {promoMsg && <p className="mt-1 text-xs text-red-600">{promoMsg}</p>}

        <dl className="mt-5 space-y-2 rounded-2xl bg-white/60 p-4 text-sm ring-1 ring-white">
          <div className="flex justify-between gap-3">
            <dt className="text-stone-500">Harga per bulan</dt>
            <dd className="font-medium">{formatRp(plan?.priceInt ?? 0)}</dd>
          </div>
          <div className="flex justify-between gap-3">
            <dt className="text-stone-500">
              Subtotal ({months} bulan)
            </dt>
            <dd className="font-medium">{formatRp(subtotal)}</dd>
          </div>
          {promo && (
            <div className="flex justify-between gap-3">
              <dt className="text-stone-500">Voucher {promo.code}</dt>
              <dd className="font-medium text-teal-700">−{formatRp(discount)}</dd>
            </div>
          )}
          <div className="flex justify-between gap-3 border-t border-stone-200 pt-2 text-base">
            <dt className="font-semibold">Total bayar</dt>
            <dd className="malika-gradient-text font-bold">{formatRp(total)}</dd>
          </div>
          {months > 1 && (
            <div className="flex justify-between gap-3 text-xs text-stone-400">
              <dt>Efektif per bulan</dt>
              <dd>{formatRp(Math.round(total / months))}</dd>
            </div>
          )}
        </dl>
      </div>

      <div className="glass rounded-3xl p-6">
        <p className="text-xs font-semibold uppercase tracking-widest text-teal-700">Perbandingan durasi</p>
        <p className="mt-1 text-xs text-stone-500">
          {plan?.name ?? "-"}
          {promo ? (
            <>
              {" "}dengan voucher <span className="font-bold text-teal-700">{promo.code}</span>
            </>
          ) : (
            " tanpa voucher"
          )}
          .
        </p>
        <div className="mt-3 overflow-hidden rounded-2xl ring-1 ring-white">
          <table className="w-full bg-white/60 text-sm">
            <thead>
              <tr className="text-left text-xs uppercase tracking-wider text-stone-400">
                <th className="px-4 py-2.5 font-semibold">Durasi</th>
                <th className="px-4 py-2.5 text-right font-semibold">Subtotal</th>
                <th className="px-4 py-2.5 text-right font-semibold">Diskon</th>
                <th className="px-4 py-2.5 text-right font-semibold">Total</th>
              </tr>
            </thead>
            <tbody>
              {DURATIONS.map((m) => {
                const sub = (plan?.priceInt ?? 0) * m;
                const disc = promo ? calcDiscount(promo, sub) : 0;
                const tot = Math.max(0, sub - disc);
                const isActive = months === m;
                return (
                  <tr
                    key={m}
                    onClick={() => setMonths(m)}
                    className={`cursor-pointer border-t border-white/70 transition hover:bg-white/80 ${
                      isActive ? "bg-teal-50/70 font-semibold" : ""
                    }`}
                  >
                    <td className="px-4 py-2.5">{durationLabel(m)}</td>
                    <td className="px-4 py-2.5 text-right">{formatRp(sub)}</td>
                    <td className="px-4 py-2.5 text-right text-teal-700">
                      {disc > 0 ? `−${formatRp(disc)}` : "–"}
                    </td>
                    <td className="px-4 py-2.5 text-right font-bold">{formatRp(tot)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
