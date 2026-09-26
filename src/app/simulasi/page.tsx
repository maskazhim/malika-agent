import Link from "next/link";
import SimulasiHarga from "@/components/SimulasiHarga";

export default function SimulasiPage() {
  return (
    <main className="mx-auto w-full max-w-6xl px-4 py-10 sm:px-6">
      <Link href="/" className="text-sm text-stone-500 hover:text-stone-900">
        ← Kembali ke beranda
      </Link>
      <p className="mt-3 text-xs font-semibold uppercase tracking-widest text-teal-700">Malika Agent</p>
      <h1 className="mt-1 text-3xl font-semibold tracking-tight">Simulasi Harga</h1>
      <p className="mt-1 text-sm text-stone-600">
        Pilih paket, masa langganan, dan kode promo untuk melihat rincian total bayar.
      </p>
      <SimulasiHarga />
    </main>
  );
}
