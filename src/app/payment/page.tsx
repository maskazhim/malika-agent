"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { QRCodeSVG } from "qrcode.react";
import { buildDynamicQris, formatRp, getStaticPayload, parseQris } from "@/lib/qris";

function PaymentInner() {
  const q = useSearchParams();
  const product = q.get("product") ?? "-";
  const amount = Number(q.get("amount") ?? 0);
  const nama = q.get("nama") ?? q.get("name") ?? "-";
  const bisnis = q.get("bisnis") ?? "-";
  const telepon = q.get("telepon") ?? "-";
  const email = q.get("email") ?? "-";

  const { payload, merchant, isDemo } = useMemo(() => {
    const { payload: statik, isDemo } = getStaticPayload();
    const dyn = buildDynamicQris(statik, amount);
    const merchant = parseQris(dyn ?? "").find((f) => f.id === "59")?.value ?? "MALIKA AI";
    return { payload: dyn, merchant, isDemo };
  }, [amount]);

  const [left, setLeft] = useState(30 * 60);
  const [paid, setPaid] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (paid || left <= 0) return;
    const t = setInterval(() => setLeft((s) => Math.max(0, s - 1)), 1000);
    return () => clearInterval(t);
  }, [paid, left]);

  const mm = String(Math.floor(left / 60)).padStart(2, "0");
  const ss = String(left % 60).padStart(2, "0");

  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-10 sm:px-6">
      <a href="/#harga" className="text-sm text-stone-500 hover:text-stone-900">← Kembali ke paket harga</a>
      <h1 className="mt-3 text-3xl font-semibold tracking-tight">
        Pembayaran <span className="malika-gradient-text">QRIS</span>
      </h1>
      <p className="mt-1 text-sm text-stone-600">Scan QR di bawah — nominal sudah disesuaikan otomatis.</p>

      <div className="mt-6 grid gap-4 md:grid-cols-2">
        <div className="glass-strong rounded-3xl p-6 text-center">
          {paid ? (
            <div className="feed-in py-8">
              <p className="malika-gradient mx-auto flex h-16 w-16 items-center justify-center rounded-full text-2xl text-white">✓</p>
              <p className="mt-4 text-lg font-bold">Pembayaran diterima!</p>
              <p className="mt-1 text-sm text-stone-500">Tim kami akan menghubungimu via WhatsApp untuk aktivasi.</p>
            </div>
          ) : payload ? (
            <>
              <div className="mx-auto w-fit rounded-2xl bg-white p-4 ring-1 ring-stone-200">
                <QRCodeSVG value={payload} size={220} level="M" />
              </div>
              <p className="malika-gradient-text mt-3 text-2xl font-bold">{formatRp(amount)}</p>
              <p className="text-xs text-stone-500">{merchant} · {product}/bulan</p>
              <p className={`mt-2 inline-block rounded-full px-3 py-1 text-xs font-semibold ${left < 300 ? "bg-red-100 text-red-700" : "bg-white/70 text-stone-600 ring-1 ring-white"}`}>
                Berlaku {mm}:{ss}
              </p>
              <div className="mt-4 flex gap-2">
                <button
                  onClick={() => {
                    navigator.clipboard?.writeText(payload).catch(() => {});
                    setCopied(true);
                    setTimeout(() => setCopied(false), 2000);
                  }}
                  className="flex-1 rounded-full bg-white/70 px-4 py-2 text-xs font-semibold ring-1 ring-white hover:bg-white"
                >
                  {copied ? "Tersalin ✓" : "Salin payload"}
                </button>
                <button onClick={() => setPaid(true)} className="malika-gradient flex-1 rounded-full px-4 py-2 text-xs font-semibold text-white hover:opacity-90">
                  Saya sudah bayar
                </button>
              </div>
            </>
          ) : (
            <p className="py-8 text-sm text-red-600">Gagal menyusun QR. Nominal tidak valid.</p>
          )}
          {isDemo && !paid && (
            <p className="mt-3 rounded-xl bg-amber-50 px-3 py-2 text-[11px] leading-relaxed text-amber-700 ring-1 ring-amber-200">
              QR demo — ganti <code>NEXT_PUBLIC_QRIS_STATIC</code> dengan payload QRIS merchant asli agar dana masuk ke rekening yang benar.
            </p>
          )}
        </div>

        <div className="glass rounded-3xl p-6">
          <p className="text-xs font-semibold uppercase tracking-widest text-teal-700">Ringkasan order</p>
          <dl className="mt-3 space-y-2 text-sm">
            {[["Produk", `${product} /bulan`], ["Nama", nama], ["Bisnis", bisnis], ["Telepon", telepon], ["Email", email]].map(([k, v]) => (
              <div key={k} className="flex justify-between gap-3">
                <dt className="text-stone-500">{k}</dt>
                <dd className="text-right font-medium">{v}</dd>
              </div>
            ))}
            <div className="flex justify-between gap-3 border-t border-white/70 pt-2">
              <dt className="font-semibold">Total</dt>
              <dd className="font-bold">{formatRp(amount)}</dd>
            </div>
          </dl>
          <ol className="mt-4 space-y-1.5 text-xs leading-relaxed text-stone-500">
            <li>1. Buka e-wallet / m-banking apa pun.</li>
            <li>2. Scan QR — pastikan nominal {formatRp(amount)}.</li>
            <li>3. Bayar, lalu klik “Saya sudah bayar”.</li>
          </ol>
        </div>
      </div>
    </main>
  );
}

export default function PaymentPage() {
  return (
    <Suspense fallback={<main className="mx-auto max-w-3xl px-4 py-10">Memuat pembayaran…</main>}>
      <PaymentInner />
    </Suspense>
  );
}
