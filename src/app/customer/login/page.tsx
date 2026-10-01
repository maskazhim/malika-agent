"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

export default function CustomerLoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [orderId, setOrderId] = useState("");
  const [showClaim, setShowClaim] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [checking, setChecking] = useState(true);

  // Kalau sudah login, langsung ke portal.
  useEffect(() => {
    fetch("/api/customer-auth")
      .then((r) => {
        if (r.ok) router.replace("/customer");
        else setChecking(false);
      })
      .catch(() => setChecking(false));
  }, [router]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      setError("Email tidak valid.");
      return;
    }
    if (!password) {
      setError("Isi password dulu ya.");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/customer-auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: email.trim(),
          password,
          ...(showClaim && orderId.trim() ? { order_id: orderId.trim() } : {}),
        }),
      });
      const data = (await res.json().catch(() => null)) as { error?: string } | null;
      if (res.ok) {
        router.replace("/customer");
      } else {
        setError(data?.error ?? "Email atau password salah.");
      }
    } catch {
      setError("Tidak bisa menghubungi server. Coba lagi.");
    } finally {
      setLoading(false);
    }
  }

  if (checking) {
    return <main className="mx-auto max-w-sm px-4 py-20 text-center text-sm text-stone-500">Memeriksa sesi…</main>;
  }

  return (
    <main className="mx-auto w-full max-w-sm px-4 py-20 sm:px-6">
      <div className="glass-strong feed-in rounded-3xl p-7">
        <p className="text-xs font-semibold uppercase tracking-widest text-teal-700">Malika · Customer</p>
        <h1 className="mt-1 text-2xl font-bold tracking-tight">Login Customer</h1>
        <p className="mt-1 text-sm text-stone-500">
          Pakai email + password yang kamu isi saat checkout.
        </p>
        <form onSubmit={submit} className="mt-5 space-y-3">
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-stone-500">Email</span>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="cth. budi@bisnis.com"
              autoComplete="email"
              className="w-full rounded-xl border border-stone-200 bg-white/80 px-3 py-2.5 text-sm outline-none focus:border-teal-400"
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-stone-500">Password</span>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              autoComplete="current-password"
              className="w-full rounded-xl border border-stone-200 bg-white/80 px-3 py-2.5 text-sm outline-none focus:border-teal-400"
            />
          </label>
          {showClaim && (
            <label className="block">
              <span className="mb-1 block text-xs font-medium text-stone-500">Order ID (aktivasi pertama)</span>
              <input
                type="text"
                value={orderId}
                onChange={(e) => setOrderId(e.target.value)}
                placeholder="cth. 550e8400-… (dari email konfirmasi)"
                className="w-full rounded-xl border border-stone-200 bg-white/80 px-3 py-2.5 font-mono text-xs outline-none focus:border-teal-400"
              />
              <span className="mt-1 block text-[11px] text-stone-400">
                Khusus kamu yang checkout sebelum ada password — cocokkan email + Order ID untuk membuat akun.
              </span>
            </label>
          )}
          {error && (
            <p className="rounded-xl bg-red-50 px-3 py-2 text-xs font-medium text-red-600 ring-1 ring-red-100">
              {error}
            </p>
          )}
          <button
            type="submit"
            disabled={loading}
            className="malika-gradient w-full rounded-full py-2.5 text-sm font-semibold text-white transition hover:opacity-90 disabled:opacity-60"
          >
            {loading ? "Memeriksa…" : "Masuk →"}
          </button>
        </form>
        <button
          onClick={() => setShowClaim((s) => !s)}
          className="mt-3 w-full text-center text-xs font-semibold text-stone-400 hover:text-teal-700"
        >
          {showClaim ? "Sembunyikan aktivasi pertama" : "Belum punya password? Aktivasi dengan Order ID"}
        </button>
        <p className="mt-4 text-center text-xs text-stone-400">
          <Link href="/" className="hover:text-stone-700">← Kembali ke beranda</Link>
        </p>
      </div>
    </main>
  );
}
