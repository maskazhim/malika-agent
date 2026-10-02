"use client";

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";

function VerifyInner() {
  const q = useSearchParams();
  const router = useRouter();
  const token = q.get("token") ?? "";
  const [state, setState] = useState<"checking" | "need_password" | "error">("checking");
  const [error, setError] = useState<string | null>(null);
  const [password, setPassword] = useState("");
  const [password2, setPassword2] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!token) {
      setState("error");
      setError("Link tidak lengkap (token hilang).");
      return;
    }
    let alive = true;
    fetch(`/api/customer-magic?token=${encodeURIComponent(token)}`)
      .then(async (r) => {
        const data = (await r.json().catch(() => null)) as { ok?: boolean; error?: string; perlu_set_password?: boolean } | null;
        if (!alive) return;
        if (!r.ok || !data?.ok) {
          setState("error");
          setError(data?.error ?? "Link tidak valid.");
          return;
        }
        if (data.perlu_set_password) {
          setState("need_password");
        } else {
          router.replace("/customer");
        }
      })
      .catch(() => {
        if (alive) {
          setState("error");
          setError("Tidak bisa menghubungi server. Coba lagi.");
        }
      });
    return () => {
      alive = false;
    };
  }, [token, router]);

  async function savePassword(e: React.FormEvent) {
    e.preventDefault();
    if (password.length < 8) {
      setError("Password minimal 8 karakter.");
      return;
    }
    if (password !== password2) {
      setError("Konfirmasi password tidak sama.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/customer-auth", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      const data = (await res.json().catch(() => null)) as { ok?: boolean; error?: string } | null;
      if (!res.ok || !data?.ok) throw new Error(data?.error ?? "gagal");
      router.replace("/customer");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal menyimpan password.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <main className="mx-auto w-full max-w-sm px-4 py-20 sm:px-6">
      <div className="glass-strong feed-in rounded-3xl p-7">
        <p className="text-xs font-semibold uppercase tracking-widest text-teal-700">Malika · Customer</p>
        {state === "checking" && (
          <>
            <h1 className="mt-1 text-2xl font-bold tracking-tight">Memverifikasi…</h1>
            <p className="mt-1 text-sm text-stone-500">Menunggu konfirmasi link login kamu.</p>
          </>
        )}
        {state === "need_password" && (
          <>
            <h1 className="mt-1 text-2xl font-bold tracking-tight">Buat Password</h1>
            <p className="mt-1 text-sm text-stone-500">
              Login berhasil! Buat password agar lain kali bisa masuk langsung tanpa link email.
            </p>
            <form onSubmit={savePassword} className="mt-5 space-y-3">
              <label className="block">
                <span className="mb-1 block text-xs font-medium text-stone-500">Password baru</span>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="min. 8 karakter"
                  autoComplete="new-password"
                  className="w-full rounded-xl border border-stone-200 bg-white/80 px-3 py-2.5 text-sm outline-none focus:border-teal-400"
                />
              </label>
              <label className="block">
                <span className="mb-1 block text-xs font-medium text-stone-500">Ulangi password</span>
                <input
                  type="password"
                  value={password2}
                  onChange={(e) => setPassword2(e.target.value)}
                  placeholder="••••••••"
                  autoComplete="new-password"
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
                disabled={saving}
                className="malika-gradient w-full rounded-full py-2.5 text-sm font-semibold text-white transition hover:opacity-90 disabled:opacity-60"
              >
                {saving ? "Menyimpan…" : "Simpan & masuk →"}
              </button>
            </form>
          </>
        )}
        {state === "error" && (
          <>
            <h1 className="mt-1 text-2xl font-bold tracking-tight">Link Bermasalah</h1>
            <p className="mt-2 rounded-xl bg-red-50 px-3 py-2 text-xs font-medium text-red-600 ring-1 ring-red-100">
              {error ?? "Link tidak valid."}
            </p>
            <Link
              href="/customer/login"
              className="malika-gradient mt-4 block rounded-full py-2.5 text-center text-sm font-semibold text-white transition hover:opacity-90"
            >
              Minta link baru →
            </Link>
          </>
        )}
      </div>
    </main>
  );
}

export default function VerifyPage() {
  return (
    <Suspense fallback={<main className="mx-auto max-w-sm px-4 py-20 text-center text-sm text-stone-500">Memverifikasi…</main>}>
      <VerifyInner />
    </Suspense>
  );
}
