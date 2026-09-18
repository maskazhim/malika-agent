"use client";

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { formatRp } from "@/lib/qris";
import { newOrderId, saveOrder, type OrderMethod } from "@/lib/orders";

const BANKS = [
  { bank: "BCA", norek: "169-3331777", an: "PT TEKNOLOGI CENDEKIA NUSANTARA" },
  { bank: "MANDIRI", norek: "1370001310008", an: "PT TEKNOLOGI CENDEKIA NUSANTARA" },
];

function PaymentInner() {
  const q = useSearchParams();
  const router = useRouter();
  const product = q.get("product") ?? "-";
  const amount = Number(q.get("amount") ?? 0);
  const nama = q.get("nama") ?? q.get("name") ?? "-";
  const bisnis = q.get("bisnis") ?? "-";
  const telepon = q.get("telepon") ?? "-";
  const email = q.get("email") ?? "-";
  const orderId = q.get("order_id") ?? "";

  const [method, setMethod] = useState<OrderMethod>("qris");
  const [left, setLeft] = useState(30 * 60);
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);

  useEffect(() => {
    if (left <= 0) return;
    const t = setInterval(() => setLeft((s) => Math.max(0, s - 1)), 1000);
    return () => clearInterval(t);
  }, [left]);

  const mm = String(Math.floor(left / 60)).padStart(2, "0");
  const ss = String(left % 60).padStart(2, "0");

  function copy(text: string, key: string) {
    navigator.clipboard?.writeText(text).catch(() => {});
    setCopied(key);
    setTimeout(() => setCopied(null), 2000);
  }

  async function confirm() {
    if (!amount || amount <= 0) {
      setError("Nominal tidak valid.");
      return;
    }
    setSending(true);
    setError(null);
    const oid = orderId || newOrderId();
    // Upload bukti transfer menyusul setelah R2 aktif; saat ini order + metode dicatat ke D1.
    await saveOrder({
      order_id: oid,
      product,
      amount,
      nama,
      bisnis,
      telepon,
      email,
      method,
      bukti_filename: "",
      status: "payment_proof",
    });
    const params = new URLSearchParams({
      method,
      product,
      amount: String(amount),
      nama,
      order_id: oid,
    });
    router.push(`/payment/success?${params.toString()}`);
  }

  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-10 sm:px-6">
      <Link href="/#harga" className="text-sm text-stone-500 hover:text-stone-900">
        ← Kembali ke paket harga
      </Link>
      <h1 className="mt-3 text-3xl font-semibold tracking-tight">
        Pembayaran <span className="malika-gradient-text">{method === "qris" ? "QRIS" : "Transfer Bank"}</span>
      </h1>
      <p className="mt-1 text-sm text-stone-600">
        {product}/bulan · <span className="font-semibold text-stone-900">{formatRp(amount)}</span> · a.n. {nama}
      </p>

      {/* Pilihan metode */}
      <div className="glass mt-5 grid grid-cols-2 gap-1 rounded-2xl p-1 text-sm font-semibold">
        {(["qris", "transfer"] as OrderMethod[]).map((m) => (
          <button
            key={m}
            onClick={() => setMethod(m)}
            className={`rounded-xl px-4 py-2.5 transition ${
              method === m ? "malika-gradient text-white shadow" : "text-stone-500 hover:bg-white/70 hover:text-stone-900"
            }`}
          >
            {m === "qris" ? "QRIS" : "Transfer Bank"}
          </button>
        ))}
      </div>

      <div className="mt-4 grid gap-4 md:grid-cols-2">
        <div className="glass-strong rounded-3xl p-6 text-center">
          {method === "qris" ? (
            <>
              <div className="mx-auto w-fit rounded-2xl bg-white p-3 ring-1 ring-stone-200">
                <img
                  src="/qris.jpg"
                  alt="QRIS Malika Agent"
                  className="h-auto w-56 rounded-lg object-contain"
                  loading="eager"
                />
              </div>
              <p className="malika-gradient-text mt-3 text-2xl font-bold">{formatRp(amount)}</p>
              <p className="text-xs text-stone-500">{product}/bulan</p>
              <p
                className={`mt-2 inline-block rounded-full px-3 py-1 text-xs font-semibold ${
                  left < 300 ? "bg-red-100 text-red-700" : "bg-white/70 text-stone-600 ring-1 ring-white"
                }`}
              >
                Berlaku {mm}:{ss}
              </p>
              <ol className="mx-auto mt-3 max-w-xs space-y-1 text-left text-xs leading-relaxed text-stone-500">
                <li>1. Buka e-wallet / m-banking apa pun.</li>
                <li>2. Scan QR — pastikan nominal {formatRp(amount)}.</li>
                <li>3. Bayar, lalu klik “Saya sudah bayar”.</li>
              </ol>
            </>
          ) : (
            <div className="text-left">
              <p className="text-xs font-semibold uppercase tracking-widest text-teal-700">Rekening tujuan</p>
              <div className="mt-3 space-y-3">
                {BANKS.map((b) => (
                  <div key={b.bank} className="rounded-2xl bg-white/80 p-4 ring-1 ring-white">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-sm font-bold">BANK {b.bank}</p>
                      <button
                        onClick={() => copy(b.norek.replace(/-/g, ""), b.bank)}
                        className="rounded-full bg-stone-900 px-3 py-1 text-[11px] font-semibold text-white hover:bg-stone-700"
                      >
                        {copied === b.bank ? "Tersalin ✓" : "Salin norek"}
                      </button>
                    </div>
                    <p className="mt-1 text-xl font-bold tracking-wide">{b.norek}</p>
                    <p className="mt-0.5 text-xs text-stone-500">a.n. {b.an}</p>
                  </div>
                ))}
              </div>
              <p className="mt-3 text-xs leading-relaxed text-stone-500">
                Transfer tepat <span className="font-semibold text-stone-800">{formatRp(amount)}</span> ke salah satu
                rekening di atas, lalu klik “Konfirmasi Transfer”.
              </p>
            </div>
          )}

          {error && (
            <p className="mt-3 rounded-xl bg-red-50 px-3 py-2 text-xs font-medium text-red-600 ring-1 ring-red-100">
              {error}
            </p>
          )}
          <button
            onClick={confirm}
            disabled={sending}
            className="malika-gradient mt-4 w-full rounded-full px-4 py-2.5 text-sm font-semibold text-white transition hover:opacity-90 disabled:opacity-60"
          >
            {sending ? "Mengirim…" : method === "qris" ? "Saya sudah bayar" : "Konfirmasi Transfer"}
          </button>
        </div>

        <div className="glass rounded-3xl p-6">
          <p className="text-xs font-semibold uppercase tracking-widest text-teal-700">Ringkasan order</p>
          <dl className="mt-3 space-y-2 text-sm">
            {[
              ["Produk", `${product} /bulan`],
              ["Nama", nama],
              ["Bisnis", bisnis],
              ["Telepon", telepon],
              ["Email", email],
            ].map(([k, v]) => (
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
          <div className="mt-4 rounded-2xl bg-white/60 p-3 text-xs leading-relaxed text-stone-500 ring-1 ring-white">
            {method === "qris" ? (
              <>Setelah konfirmasi, pesananmu langsung diproses. Kalau server agent sudah siap, tim Malika akan menghubungimu.</>
            ) : (
              <>Setelah konfirmasi, tim Finance Malika akan memverifikasi pembayaranmu lalu menghubungimu.</>
            )}
          </div>
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
