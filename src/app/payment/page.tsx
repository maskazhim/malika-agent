"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import Link from "next/link";
import QRCode from "react-qr-code";
import { useRouter, useSearchParams } from "next/navigation";
import { buildDynamicQris, formatRp, getStaticPayload, parseQris } from "@/lib/qris";
import {
  allocateCode,
  buildTransferWaLink,
  newOrderId,
  saveOrder,
  type AllocatedCode,
  type OrderMethod,
} from "@/lib/orders";

const BANKS = [
  { bank: "BCA", norek: "169-3331777", an: "PT TEKNOLOGI CENDEKIA NUSANTARA" },
  { bank: "MANDIRI", norek: "1370001310008", an: "PT TEKNOLOGI CENDEKIA NUSANTARA" },
];

function merchantName(payload: string): string {
  return parseQris(payload).find((f) => f.id === "59")?.value.trim() || "Merchant QRIS";
}

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

  // QRIS dinamis + kode unik
  const [alloc, setAlloc] = useState<AllocatedCode | null>(null);
  const [qr, setQr] = useState<string | null>(null);
  const [allocLoading, setAllocLoading] = useState(false);
  const [allocError, setAllocError] = useState<string | null>(null);
  const allocFor = useRef<string>("");

  useEffect(() => {
    if (left <= 0) return;
    const t = setInterval(() => setLeft((s) => Math.max(0, s - 1)), 1000);
    return () => clearInterval(t);
  }, [left]);

  // Alokasi kode unik sekali per order saat tab QRIS dibuka.
  useEffect(() => {
    if (method !== "qris" || !orderId || allocFor.current === orderId) return;
    allocFor.current = orderId;
    setAllocLoading(true);
    setAllocError(null);
    allocateCode(orderId)
      .then((a) => {
        if (!a) {
          setAllocError("Gagal menyiapkan kode unik. Cek koneksi lalu muat ulang halaman.");
          return;
        }
        setAlloc(a);
        const { payload } = getStaticPayload();
        const dyn = buildDynamicQris(payload, a.amount);
        if (!dyn) setAllocError("QRIS merchant tidak valid. Hubungi tim Malika.");
        else setQr(dyn);
      })
      .catch(() => setAllocError("Gagal menyiapkan kode unik. Cek koneksi lalu muat ulang halaman."))
      .finally(() => setAllocLoading(false));
  }, [method, orderId]);

  const mm = String(Math.floor(left / 60)).padStart(2, "0");
  const ss = String(left % 60).padStart(2, "0");

  const total = method === "qris" && alloc ? alloc.amount : amount;

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
    if (method === "transfer") {
      // Konfirmasi transfer langsung ke WhatsApp admin.
      setSending(true);
      setError(null);
      const oid = orderId || newOrderId();
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
      window.open(buildTransferWaLink({ order_id: oid, product, amount, nama }), "_blank");
      const params = new URLSearchParams({
        method,
        product,
        amount: String(amount),
        nama,
        order_id: oid,
      });
      router.push(`/payment/success?${params.toString()}`);
      return;
    }
    // QRIS: wajib ada kode unik agar bisa diverifikasi otomatis.
    if (!alloc) {
      setError("Kode unik belum siap. Muat ulang halaman dulu ya.");
      return;
    }
    setSending(true);
    setError(null);
    const oid = orderId || newOrderId();
    await saveOrder({
      order_id: oid,
      product,
      amount: alloc.amount,
      nama,
      bisnis,
      telepon,
      email,
      method,
      bukti_filename: "",
      status: "payment_proof",
      unique_code: alloc.unique_code,
      code_expires_at: alloc.expires_at,
    });
    const params = new URLSearchParams({
      method,
      product,
      amount: String(alloc.amount),
      base: String(alloc.base),
      unique_code: String(alloc.unique_code),
      nama,
      order_id: oid,
    });
    router.push(`/payment/success?${params.toString()}`);
  }

  const { payload: staticPayload, isDemo } = getStaticPayload();

  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-10 sm:px-6">
      <Link href="/#harga" className="text-sm text-stone-500 hover:text-stone-900">
        ← Kembali ke paket harga
      </Link>
      <h1 className="mt-3 text-3xl font-semibold tracking-tight">
        Pembayaran <span className="malika-gradient-text">{method === "qris" ? "QRIS" : "Transfer Bank"}</span>
      </h1>
      <p className="mt-1 text-sm text-stone-600">
        {product}/bulan · <span className="font-semibold text-stone-900">{formatRp(total)}</span> · a.n. {nama}
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
              {allocLoading || (!qr && !allocError) ? (
                <div className="mx-auto flex w-fit flex-col items-center rounded-2xl bg-white p-8 ring-1 ring-stone-200">
                  <p className="text-sm text-stone-500">Menyiapkan QR + kode unik…</p>
                </div>
              ) : allocError || !qr || !alloc ? (
                <div className="mx-auto w-fit max-w-xs rounded-2xl bg-red-50 p-5 text-sm text-red-600 ring-1 ring-red-100">
                  {allocError ?? "QR belum siap."}
                  <button
                    onClick={() => {
                      allocFor.current = "";
                      setAlloc(null);
                      setQr(null);
                    }}
                    className="mt-3 w-full rounded-full bg-stone-900 py-2 text-xs font-semibold text-white"
                  >
                    Coba lagi
                  </button>
                </div>
              ) : (
                <>
                  <div className="mx-auto w-fit rounded-2xl bg-white p-3 ring-1 ring-stone-200">
                    <QRCode value={qr} size={224} />
                  </div>
                  <p className="mt-2 text-xs text-stone-500">{merchantName(staticPayload)}</p>
                  {isDemo && (
                    <p className="mt-1 inline-block rounded-full bg-amber-100 px-2.5 py-0.5 text-[11px] font-semibold text-amber-800">
                      Mode testing — QR valid format, jangan bayar asli
                    </p>
                  )}
                  <dl className="mx-auto mt-3 max-w-xs space-y-1 text-sm">
                    <div className="flex justify-between text-stone-500">
                      <dt>Harga paket</dt>
                      <dd>{formatRp(alloc.base)}</dd>
                    </div>
                    <div className="flex justify-between text-stone-500">
                      <dt>Kode unik</dt>
                      <dd className="font-semibold text-teal-700">+{alloc.unique_code}</dd>
                    </div>
                    <div className="flex justify-between border-t border-stone-200 pt-1 text-base font-bold">
                      <dt>Total bayar</dt>
                      <dd className="malika-gradient-text">{formatRp(alloc.amount)}</dd>
                    </div>
                  </dl>
                  <p
                    className={`mt-2 inline-block rounded-full px-3 py-1 text-xs font-semibold ${
                      left < 300 ? "bg-red-100 text-red-700" : "bg-white/70 text-stone-600 ring-1 ring-white"
                    }`}
                  >
                    Berlaku {mm}:{ss}
                  </p>
                  <ol className="mx-auto mt-3 max-w-xs space-y-1 text-left text-xs leading-relaxed text-stone-500">
                    <li>1. Buka e-wallet / m-banking apa pun.</li>
                    <li>2. Scan QR — nominal {formatRp(alloc.amount)} sudah terisi otomatis, jangan diubah.</li>
                    <li>3. Bayar, lalu klik “Saya sudah bayar”.</li>
                  </ol>
                </>
              )}
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
                rekening di atas, lalu klik tombol di bawah — kamu akan diarahkan ke WhatsApp admin. Silakan kirimkan
                bukti transfer untuk diverifikasi.
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
            disabled={sending || (method === "qris" && !alloc)}
            className="malika-gradient mt-4 w-full rounded-full px-4 py-2.5 text-sm font-semibold text-white transition hover:opacity-90 disabled:opacity-60"
          >
            {sending ? "Mengirim…" : method === "qris" ? "Saya sudah bayar" : "Konfirmasi via WhatsApp"}
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
            {method === "qris" && alloc && (
              <div className="flex justify-between gap-3">
                <dt className="text-stone-500">Kode unik</dt>
                <dd className="text-right font-medium text-teal-700">+{alloc.unique_code}</dd>
              </div>
            )}
            <div className="flex justify-between gap-3 border-t border-white/70 pt-2">
              <dt className="font-semibold">Total</dt>
              <dd className="font-bold">{formatRp(total)}</dd>
            </div>
          </dl>
          <div className="mt-4 rounded-2xl bg-white/60 p-3 text-xs leading-relaxed text-stone-500 ring-1 ring-white">
            {method === "qris" ? (
              <>Setelah konfirmasi, sistem mencocokkan kode unik pembayaranmu secara otomatis. Kalau server agent sudah siap, tim Malika akan menghubungimu.</>
            ) : (
              <>Setelah klik konfirmasi, kirim bukti transfer via WhatsApp. Tim Finance Malika akan memverifikasi pembayaranmu lalu menghubungimu.</>
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
