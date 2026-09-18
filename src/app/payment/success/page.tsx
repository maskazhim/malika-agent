"use client";

import { Suspense } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { formatRp } from "@/lib/qris";

function SuccessInner() {
  const q = useSearchParams();
  const method = q.get("method") ?? "qris";
  const product = q.get("product") ?? "-";
  const amount = Number(q.get("amount") ?? 0);
  const nama = q.get("nama") ?? "-";
  const orderId = q.get("order_id") ?? "";
  const isTransfer = method === "transfer";

  return (
    <main className="mx-auto w-full max-w-xl px-4 py-14 sm:px-6">
      <div className="glass-strong feed-in rounded-3xl p-8 text-center">
        <p className="malika-gradient mx-auto flex h-16 w-16 items-center justify-center rounded-full text-2xl text-white">
          ✓
        </p>
        {isTransfer ? (
          <>
            <p className="mt-4 text-[11px] font-semibold uppercase tracking-widest text-teal-700">
              Konfirmasi diterima
            </p>
            <h1 className="mt-1 text-2xl font-bold tracking-tight">Konfirmasi pembayaran diterima!</h1>
            <p className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-stone-600">
              Terima kasih{nama !== "-" ? `, ${nama}` : ""}! Konfirmasimu sudah kami terima. Tim Finance Malika
              akan menghubungimu jika pembayaran sudah diverifikasi.
            </p>
          </>
        ) : (
          <>
            <p className="mt-4 text-[11px] font-semibold uppercase tracking-widest text-teal-700">Thank you</p>
            <h1 className="mt-1 text-2xl font-bold tracking-tight">Pembayaran diterima!</h1>
            <p className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-stone-600">
              Terima kasih{nama !== "-" ? `, ${nama}` : ""}! Pesananmu sedang diproses. Kalau server agent sudah siap,
              tim Malika akan menghubungimu.
            </p>
          </>
        )}

        <dl className="mx-auto mt-6 max-w-sm space-y-2 rounded-2xl bg-white/60 p-4 text-left text-sm ring-1 ring-white">
          <div className="flex justify-between gap-3">
            <dt className="text-stone-500">Produk</dt>
            <dd className="font-medium">{product}/bulan</dd>
          </div>
          <div className="flex justify-between gap-3">
            <dt className="text-stone-500">Total</dt>
            <dd className="font-bold">{amount ? formatRp(amount) : "-"}</dd>
          </div>
          <div className="flex justify-between gap-3">
            <dt className="text-stone-500">Metode</dt>
            <dd className="font-medium">{isTransfer ? "Transfer Bank" : "QRIS"}</dd>
          </div>
          {orderId && (
            <div className="flex justify-between gap-3">
              <dt className="text-stone-500">Order ID</dt>
              <dd className="max-w-45 truncate font-mono text-xs">{orderId}</dd>
            </div>
          )}
        </dl>

        <div className="mt-6 flex flex-col gap-2 sm:flex-row sm:justify-center">
          <Link
            href="/"
            className="malika-gradient rounded-full px-6 py-2.5 text-sm font-semibold text-white hover:opacity-90"
          >
            Kembali ke Beranda
          </Link>
          <Link
            href="/#harga"
            className="rounded-full bg-white/70 px-6 py-2.5 text-sm font-semibold ring-1 ring-white hover:bg-white"
          >
            Lihat Paket Lain
          </Link>
        </div>
      </div>
    </main>
  );
}

export default function PaymentSuccessPage() {
  return (
    <Suspense fallback={<main className="mx-auto max-w-xl px-4 py-14">Memuat konfirmasi…</main>}>
      <SuccessInner />
    </Suspense>
  );
}
