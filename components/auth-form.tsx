// language: TypeScript, file: components/auth-form.tsx, target: client component
"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

export default function AuthForm({ mode }: { mode: "login" | "register" }) {
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setBusy(true);
    try {
      const res = await fetch(`/api/auth/${mode}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ username, password }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string; detail?: string };
        setError(
          body.error === "username_taken"
            ? "Username sudah dipakai"
            : body.error === "invalid_credentials"
              ? "Username atau password salah"
              : body.error === "too_many_attempts"
                ? "Terlalu banyak percobaan, coba lagi 10 menit"
                : body.detail ?? "Permintaan tidak valid",
        );
        return;
      }
      router.replace("/");
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-1 items-center justify-center p-6">
      <form
        onSubmit={submit}
        className="w-full max-w-sm rounded-2xl border border-[var(--border)] bg-[var(--sidebar)] p-7"
      >
        <div className="mb-1 flex items-center gap-2">
          <span className="inline-block h-6 w-6 rounded-md bg-[#facc15]" />
          <h1 className="text-lg font-semibold">{mode === "login" ? "Masuk" : "Buat akun"}</h1>
        </div>
        <p className="mb-6 text-sm text-[var(--muted)]">
          {mode === "login" ? "Lanjutkan sesi chat kamu." : "Akun baru untuk sesi chat terpisah."}
        </p>

        <label className="mb-1 block text-sm font-medium">Username</label>
        <input
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          autoComplete="username"
          className="mb-4 w-full rounded-lg border border-[var(--border)] bg-[var(--bg)] px-3 py-2.5 text-sm outline-none focus:border-[#facc15]"
          placeholder="username"
        />

        <label className="mb-1 block text-sm font-medium">Password</label>
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoComplete={mode === "login" ? "current-password" : "new-password"}
          className="mb-4 w-full rounded-lg border border-[var(--border)] bg-[var(--bg)] px-3 py-2.5 text-sm outline-none focus:border-[#facc15]"
          placeholder={mode === "register" ? "min 8 karakter" : "password"}
        />

        {error ? <p className="mb-3 text-sm text-red-500">{error}</p> : null}

        <button
          type="submit"
          disabled={busy || !username || !password}
          className="w-full rounded-lg bg-[#facc15] px-4 py-2.5 text-sm font-semibold text-black transition disabled:opacity-50"
        >
          {busy ? "Memproses…" : mode === "login" ? "Masuk" : "Daftar"}
        </button>

        <p className="mt-4 text-center text-sm text-[var(--muted)]">
          {mode === "login" ? (
            <>
              Belum punya akun?{" "}
              <Link href="/register" className="text-[#ca8a04] underline dark:text-[#facc15]">
                Daftar
              </Link>
            </>
          ) : (
            <>
              Sudah punya akun?{" "}
              <Link href="/login" className="text-[#ca8a04] underline dark:text-[#facc15]">
                Masuk
              </Link>
            </>
          )}
        </p>
      </form>
    </div>
  );
}
