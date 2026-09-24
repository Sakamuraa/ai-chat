// language: TypeScript, file: components/auth-form.tsx, target: client component
"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowRight } from "@phosphor-icons/react";
import { BrandMark } from "./sidebar";
import { useI18n } from "./i18n";

export default function AuthForm({ mode }: { mode: "login" | "register" }) {
  const router = useRouter();
  const { t } = useI18n();
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
            ? t("auth.errTaken")
            : body.error === "invalid_credentials"
              ? t("auth.errCredentials")
              : body.error === "too_many_attempts"
                ? t("auth.errRate")
                : (body.detail ?? t("auth.errGeneric")),
        );
        return;
      }
      window.dispatchEvent(new Event("profile-changed"));
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
          {isLogin ? t("auth.loginTitle") : t("auth.registerTitle")}
        </h1>
        <p className="mt-1.5 text-sm text-[var(--muted)]">
          {isLogin ? t("auth.loginSub") : t("auth.registerSub")}
        </p>

        <div className="mt-6 space-y-4">
          <div>
            <label htmlFor="username" className="mb-1.5 block text-[13px] font-medium">
              {t("auth.username")}
            </label>
            <input
              id="username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              autoComplete="username"
              className="w-full rounded-xl border border-[var(--border)] bg-[var(--bg)] px-3.5 py-2.5 text-sm text-[var(--fg)] placeholder:text-[var(--muted)] focus:border-[var(--border-strong)]"
              placeholder={t("auth.usernamePh")}
            />
          </div>

          <div>
            <label htmlFor="password" className="mb-1.5 block text-[13px] font-medium">
              {t("auth.password")}
            </label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete={isLogin ? "current-password" : "new-password"}
              className="w-full rounded-xl border border-[var(--border)] bg-[var(--bg)] px-3.5 py-2.5 text-sm text-[var(--fg)] placeholder:text-[var(--muted)] focus:border-[var(--border-strong)]"
              placeholder={isLogin ? t("auth.passwordPh") : t("auth.passwordHint")}
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
          {busy ? t("auth.processing") : isLogin ? t("auth.login") : t("auth.register")}
          {!busy ? <ArrowRight size={15} weight="bold" /> : null}
        </button>

        <p className="mt-5 text-center text-sm text-[var(--muted)]">
          {isLogin ? (
            <>
              {t("auth.noAccount")}{" "}
              <Link
                href="/register"
                className="font-medium text-[#a16207] underline underline-offset-4 dark:text-[var(--accent)]"
              >
                {t("auth.register")}
              </Link>
            </>
          ) : (
            <>
              {t("auth.haveAccount")}{" "}
              <Link
                href="/login"
                className="font-medium text-[#a16207] underline underline-offset-4 dark:text-[var(--accent)]"
              >
                {t("auth.login")}
              </Link>
            </>
          )}
        </p>
      </form>
    </div>
  );
}
