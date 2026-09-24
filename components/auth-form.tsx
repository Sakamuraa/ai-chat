// language: TypeScript, file: components/auth-form.tsx, target: client component
"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowRight } from "@phosphor-icons/react";
import { BrandMark } from "./sidebar";

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
            ? "Username sudah dipakai."
            : body.error === "invalid_credentials"
              ? "Username atau password salah."
              : body.error === "too_many_attempts"
                ? "Terlalu banyak percobaan. Coba lagi dalam 10 menit."
                : (body.detail ?? "Permintaan tidak valid."),
        );
        return;
      }
      router.replace("/");
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  const isLogin = mode === "login";

  return (
    <div className="flex flex-1 items-center justify-center px-5 py-10">
      <form
        onSubmit={submit}
        className="fade-up w-full max-w-[380px] rounded-xl border border-[var(--border)] bg-[var(--panel)] p-7 shadow-[0_1px_3px_rgba(0,0,0,0.05)]"
      >
        <BrandMark size={28} />
        <h1 className="mt-5 text-[22px] font-semibold tracking-tight">
          {isLogin ? "Masuk ke akun kamu" : "Buat akun baru"}
        </h1>
        <p className="mt-1.5 text-sm text-[var(--muted)]">
          {isLogin
            ? "Sesi chat kamu tersimpan di akun ini."
            : "Setiap akun punya sesi chat terpisah."}
        </p>

        <div className="mt-6 space-y-4">
          <div>
            <label htmlFor="username" className="mb-1.5 block text-[13px] font-medium">
              Username
            </label>
            <input
              id="username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              autoComplete="username"
              className="w-full rounded-xl border border-[var(--border)] bg-[var(--bg)] px-3.5 py-2.5 text-sm text-[var(--fg)] placeholder:text-[var(--muted)] focus:border-[var(--border-strong)]"
              placeholder="username"
            />
          </div>

          <div>
            <label htmlFor="password" className="mb-1.5 block text-[13px] font-medium">
              Password
            </label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete={isLogin ? "current-password" : "new-password"}
              className="w-full rounded-xl border border-[var(--border)] bg-[var(--bg)] px-3.5 py-2.5 text-sm text-[var(--fg)] placeholder:text-[var(--muted)] focus:border-[var(--border-strong)]"
              placeholder={isLogin ? "password" : "minimal 8 karakter"}
            />
          </div>
        </div>

        {error ? (
          <p className="mt-4 rounded-xl border border-[color-mix(in_srgb,var(--danger)_45%,transparent)] bg-[color-mix(in_srgb,var(--danger)_10%,transparent)] px-3.5 py-2.5 text-sm text-[var(--danger)]">
            {error}
          </p>
        ) : null}

        <button
          type="submit"
          disabled={busy || !username || !password}
          className="mt-6 flex w-full items-center justify-center gap-2 rounded-full bg-[var(--accent)] px-4 py-2.5 text-sm font-semibold text-[var(--accent-fg)] transition hover:brightness-95 active:scale-[0.98] disabled:opacity-45"
        >
          {busy ? "Memproses…" : isLogin ? "Masuk" : "Daftar"}
          {!busy ? <ArrowRight size={15} weight="bold" /> : null}
        </button>

        <p className="mt-5 text-center text-sm text-[var(--muted)]">
          {isLogin ? (
            <>
              Belum punya akun?{" "}
              <Link href="/register" className="font-medium text-[#a16207] underline underline-offset-4 dark:text-[var(--accent)]">
                Daftar
              </Link>
            </>
          ) : (
            <>
              Sudah punya akun?{" "}
              <Link href="/login" className="font-medium text-[#a16207] underline underline-offset-4 dark:text-[var(--accent)]">
                Masuk
              </Link>
            </>
          )}
        </p>
      </form>
    </div>
  );
}
