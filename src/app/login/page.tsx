"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

export default function LoginPage() {
  const router = useRouter();
  const [passcode, setPasscode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [checking, setChecking] = useState(true);

  // Kalau sudah ada sesi, langsung ke dashboard.
  useEffect(() => {
    fetch("/api/auth")
      .then((r) => {
        if (r.ok) router.replace("/admin");
        else setChecking(false);
      })
      .catch(() => setChecking(false));
  }, [router]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!passcode) {
      setError("Isi passcode dulu ya.");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ passcode }),
      });
      if (res.ok) {
        router.replace("/admin");
      } else if (res.status === 429) {
        setError("Terlalu banyak percobaan. Coba lagi nanti.");
      } else {
        setError("Passcode salah.");
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
        <p className="text-xs font-semibold uppercase tracking-widest text-teal-700">Malika · Internal</p>
        <h1 className="mt-1 text-2xl font-bold tracking-tight">Login Admin</h1>
        <p className="mt-1 text-sm text-stone-500">Masuk untuk membuka dashboard order.</p>
        <form onSubmit={submit} className="mt-5 space-y-3">
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-stone-500">Passcode</span>
            <input
              type="password"
              value={passcode}
              onChange={(e) => setPasscode(e.target.value)}
              placeholder="••••••••"
              autoComplete="current-password"
              className="w-full rounded-xl border border-stone-200 bg-white/80 px-3 py-2.5 text-sm outline-none focus:border-teal-400"
            />
          </label>
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
      </div>
    </main>
  );
}
