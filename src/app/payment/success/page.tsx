"use client";

import { Suspense, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { formatRp } from "@/lib/qris";
import { buildTransferWaLink, productLabel } from "@/lib/orders";

function SuccessInner() {
  const q = useSearchParams();
  const method = q.get("method") ?? "qris";
  const product = q.get("product") ?? "-";
  const months = Math.max(1, Number(q.get("months") ?? 1) || 1);
  const amount = Number(q.get("amount") ?? 0);
  const base = Number(q.get("base") ?? 0);
  const subtotal = Number(q.get("subtotal") ?? 0);
  const uniqueCode = Number(q.get("unique_code") ?? 0);
  const nama = q.get("nama") ?? "-";
  const orderId = q.get("order_id") ?? "";
  const promoCode = (q.get("promo_code") ?? "").trim().toUpperCase();
  const discount = Math.max(0, Number(q.get("discount") ?? 0) || 0);
  const isTransfer = method === "transfer";
  const label = productLabel(product, months);
  const [portalLoading, setPortalLoading] = useState(false);
  const [portalError, setPortalError] = useState<string | null>(null);

  // Masuk portal customer tanpa login: tukar order_id dengan link sekali pakai.
  async function enterPortal() {
    if (!orderId || portalLoading) return;
    setPortalLoading(true);
    setPortalError(null);
    try {
      const res = await fetch("/api/customer-portal-link", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ order_id: orderId }),
      });
      const data = (await res.json().catch(() => null)) as { ok?: boolean; url?: string; error?: string } | null;
      if (!res.ok || !data?.ok || !data.url) throw new Error(data?.error ?? "gagal");
      window.location.href = data.url;
    } catch (err) {
      setPortalError(err instanceof Error ? err.message : "Gagal masuk portal.");
      setPortalLoading(false);
    }
  }

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
            <dd className="font-medium">{label}</dd>
          </div>
          {months > 1 && subtotal > 0 && (
            <div className="flex justify-between gap-3">
              <dt className="text-stone-500">Subtotal ({months} bulan)</dt>
              <dd className="font-medium">{formatRp(subtotal)}</dd>
            </div>
          )}
          {!isTransfer && base > 0 && uniqueCode > 0 && (
            <>
              <div className="flex justify-between gap-3">
                <dt className="text-stone-500">Harga paket</dt>
                <dd className="font-medium">{formatRp(base)}</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-stone-500">Kode unik</dt>
                <dd className="font-medium text-teal-700">+{uniqueCode}</dd>
              </div>
            </>
          )}
          {promoCode && (
            <div className="flex justify-between gap-3">
              <dt className="text-stone-500">Voucher {promoCode}</dt>
              <dd className="font-medium text-teal-700">−{formatRp(discount)}</dd>
            </div>
          )}
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
          {orderId && (
            <button
              onClick={enterPortal}
              disabled={portalLoading}
              className="malika-gradient rounded-full px-6 py-2.5 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-60"
            >
              {portalLoading ? "Membuka portal…" : "Masuk ke Portal Customer →"}
            </button>
          )}
          {isTransfer && orderId ? (
            <a
              href={buildTransferWaLink({ order_id: orderId, product: label, amount, nama })}
              target="_blank"
              rel="noopener noreferrer"
              className="rounded-full bg-white/70 px-6 py-2.5 text-sm font-semibold ring-1 ring-white hover:bg-white"
            >
              Kirim Bukti via WhatsApp
            </a>
          ) : (
            <Link
              href="/"
              className="rounded-full bg-white/70 px-6 py-2.5 text-sm font-semibold ring-1 ring-white hover:bg-white"
            >
              Kembali ke Beranda
            </Link>
          )}
          <Link
            href="/#harga"
            className="rounded-full bg-white/70 px-6 py-2.5 text-sm font-semibold ring-1 ring-white hover:bg-white"
          >
            Lihat Paket Lain
          </Link>
        </div>
        {portalError && (
          <p className="mx-auto mt-3 max-w-sm rounded-xl bg-red-50 px-3 py-2 text-xs font-medium text-red-600 ring-1 ring-red-100">
            {portalError}
          </p>
        )}
        {orderId && (
          <p className="mx-auto mt-3 max-w-md text-[11px] leading-relaxed text-stone-400">
            Tombol portal memakai link sekali pakai — simpan Order ID & password kamu untuk login berikutnya.
          </p>
        )}
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
