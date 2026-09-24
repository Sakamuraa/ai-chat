// language: TypeScript, file: components/auth-form.tsx, target: client component — masuk (email) / daftar (nickname+email) / OTP / OAuth
"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowRight } from "@phosphor-icons/react";
import { BrandMark } from "./sidebar";
import { useI18n } from "./i18n";

type Providers = { google: boolean; discord: boolean; smtp: boolean };

const FIELD =
  "w-full rounded-xl border border-[var(--border)] bg-[var(--bg)] px-3.5 py-2.5 text-sm text-[var(--fg)] placeholder:text-[var(--muted)] focus:border-[var(--border-strong)]";
const LABEL = "mb-1.5 block text-[13px] font-medium";

function GoogleIcon() {
  return (
    <svg viewBox="0 0 18 18" aria-hidden className="h-4 w-4">
      <path fill="#4285F4" d="M17.6 9.2c0-.6-.1-1.3-.2-1.9H9v3.5h4.8a4.1 4.1 0 0 1-1.8 2.7v2.2h2.9c1.7-1.6 2.7-3.9 2.7-6.5Z" />
      <path fill="#34A853" d="M9 18c2.4 0 4.5-.8 6-2.2l-2.9-2.3c-.8.6-1.9.9-3.1.9-2.4 0-4.4-1.6-5.1-3.8H.9v2.3A9 9 0 0 0 9 18Z" />
      <path fill="#FBBC05" d="M3.9 10.6a5.4 5.4 0 0 1 0-3.4V4.9H.9a9 9 0 0 0 0 8.1l3-2.4Z" />
      <path fill="#EA4335" d="M9 3.6c1.3 0 2.5.5 3.4 1.3l2.6-2.6A9 9 0 0 0 .9 4.9l3 2.3C4.6 5.1 6.6 3.6 9 3.6Z" />
    </svg>
  );
}

function DiscordIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden className="h-4 w-4">
      <path
        fill="currentColor"
        d="M20.3 4.9A17.6 17.6 0 0 0 16 3.5l-.2.4c1.5.4 2.4 1 3.3 1.7a12.5 12.5 0 0 0-10.2 0c.9-.7 1.9-1.3 3.3-1.7L14 3.5c-1.6.3-3.1.8-4.4 1.5-2.2 3.2-2.8 6.4-2.5 9.6a13.7 13.7 0 0 0 4.2 2.1l.9-1.4c-.7-.3-1.4-.6-2-1.1l.4-.3a9.7 9.7 0 0 0 8 0l.4.3c-.6.5-1.3.8-2 1.1l.9 1.4a13.7 13.7 0 0 0 4.2-2.1c.4-3.8-.6-7-2.7-9.6ZM9.3 13.6c-.8 0-1.5-.8-1.5-1.7s.7-1.7 1.5-1.7 1.5.8 1.5 1.7-.7 1.7-1.5 1.7Zm5.4 0c-.8 0-1.5-.8-1.5-1.7s.7-1.7 1.5-1.7 1.5.8 1.5 1.7-.7 1.7-1.5 1.7Z"
      />
    </svg>
  );
}

export default function AuthForm({ mode }: { mode: "login" | "register" }) {
  const router = useRouter();
  const { t } = useI18n();

  const [step, setStep] = useState<"form" | "otp" | "forgot">("form");
  const [forgotSent, setForgotSent] = useState(false);
  const [nickname, setNickname] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [code, setCode] = useState("");
  const [pendingEmail, setPendingEmail] = useState("");
  const [devCode, setDevCode] = useState("");
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [providers, setProviders] = useState<Providers>({ google: false, discord: false, smtp: false });

  useEffect(() => {
    fetch("/api/auth/providers")
      .then((r) => (r.ok ? r.json() : null))
      .then((b: Providers | null) => {
        if (b) setProviders(b);
      })
      .catch(() => {});
    const q = new URLSearchParams(window.location.search);
    const err = q.get("auth_error");
    if (err) setError(t("auth.errProvider"));
  }, [t]);

  function messageOf(body: { error?: string; detail?: string }): string {
    switch (body.error) {
      case "email_taken":
        return t("auth.errEmailTaken");
      case "invalid_credentials":
        return t("auth.errCredentials");
      case "too_many_attempts":
        return t("auth.errRate");
      case "wrong":
        return t("auth.errWrong");
      case "expired":
        return t("auth.errExpired");
      case "attempts":
        return t("auth.errAttempts");
      case "mail_failed":
      case "mail_not_configured":
        return t("auth.errMail");
      case "invalid_body":
        return body.detail ?? t("auth.errGeneric");
      default:
        return body.detail ?? t("auth.errGeneric");
    }
  }

  function done() {
    window.dispatchEvent(new Event("profile-changed"));
    router.replace("/");
    router.refresh();
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setNotice("");
    setBusy(true);
    try {
      if (step === "forgot") {
        if (!forgotSent) {
          const res = await fetch("/api/auth/forgot", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ email }),
          });
          const body = (await res.json().catch(() => ({}))) as { error?: string; devCode?: string };
          if (!res.ok) return setError(messageOf(body));
          setDevCode(body.devCode ?? "");
          setForgotSent(true);
          setCode("");
          return;
        }
        const res = await fetch("/api/auth/reset", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ email, code, password }),
        });
        const body = (await res.json().catch(() => ({}))) as { error?: string; detail?: string };
        if (!res.ok) return setError(messageOf(body));
        setStep("form");
        setForgotSent(false);
        setNotice(t("auth.resetOk"));
        setPassword("");
        setConfirm("");
        return;
      }
      if (step === "otp") {
        const res = await fetch("/api/auth/verify", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ email: pendingEmail, code }),
        });
        if (!res.ok) return setError(messageOf(await res.json().catch(() => ({}))));
        return done();
      }
      if (mode === "login") {
        const res = await fetch("/api/auth/login", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ email, password }),
        });
        const body = (await res.json().catch(() => ({}))) as { error?: string; email?: string };
        if (!res.ok) {
          if (body.error === "verify_required") {
            setPendingEmail(body.email ?? email);
            setStep("otp");
            return sendCode(body.email ?? email, true);
          }
          return setError(messageOf(body));
        }
        return done();
      }

      if (password !== confirm) return setError(t("auth.errMismatch"));
      const res = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ nickname, email, password, confirm }),
      });
      const body = (await res.json().catch(() => ({}))) as { error?: string; detail?: string; verify?: string; devCode?: string };
      if (!res.ok) return setError(messageOf(body));
      setPendingEmail(body.verify ?? email);
      setDevCode(body.devCode ?? "");
      setStep("otp");
      setCode("");
    } finally {
      setBusy(false);
    }
  }

  async function sendCode(target: string, silent = false) {
    setError("");
    setNotice("");
    try {
      const res = await fetch("/api/auth/resend", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email: target }),
      });
      const body = (await res.json().catch(() => ({}))) as { error?: string; devCode?: string };
      if (!res.ok) return setError(messageOf(body));
      setDevCode(body.devCode ?? "");
      if (!silent) setNotice(t("auth.resent"));
    } catch {
      setError(t("auth.errGeneric"));
    }
  }

  const isLogin = mode === "login";
  const hasOauth = providers.google || providers.discord;
  const canSubmit =
    step === "forgot"
      ? forgotSent
        ? Boolean(email) && /^\d{6}$/.test(code) && password.length >= 8
        : /^\S+@\S+\.\S+$/.test(email)
      : step === "otp"
      ? /^\d{6}$/.test(code)
      : isLogin
        ? Boolean(email && password)
        : Boolean(nickname && email && password && confirm);

  return (
    <div className="flex flex-1 items-center justify-center px-5 py-10">
      <form
        onSubmit={submit}
        className="fade-up w-full max-w-[380px] rounded-xl border border-[var(--border)] bg-[var(--panel)] p-7 shadow-[0_1px_3px_rgba(0,0,0,0.05)]"
      >
        <BrandMark size={28} />

        {step === "forgot" ? (
          <>
            <h1 className="mt-5 text-[22px] font-semibold tracking-tight">{t("auth.forgotTitle")}</h1>
            <p className="mt-1.5 text-sm text-[var(--muted)]">{t("auth.forgotSub")}</p>

            <div className="mt-6 space-y-4">
              <div>
                <label htmlFor="f-email" className={LABEL}>
                  {t("auth.email")}
                </label>
                <input
                  id="f-email"
                  type="email"
                  disabled={forgotSent}
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className={`${FIELD} disabled:opacity-60`}
                  placeholder={t("auth.emailPh")}
                />
              </div>
              {forgotSent ? (
                <>
                  <div>
                    <label htmlFor="f-code" className={LABEL}>
                      {t("auth.code")}
                    </label>
                    <input
                      id="f-code"
                      inputMode="numeric"
                      maxLength={6}
                      value={code}
                      onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
                      className={`${FIELD} tracking-[0.5em]`}
                      placeholder={t("auth.codePh")}
                    />
                  </div>
                  <div>
                    <label htmlFor="f-pass" className={LABEL}>
                      {t("auth.newPassword")}
                    </label>
                    <input
                      id="f-pass"
                      type="password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      autoComplete="new-password"
                      className={FIELD}
                      placeholder={t("auth.passwordHint")}
                    />
                  </div>
                </>
              ) : null}
            </div>

            {devCode && forgotSent ? (
              <p className="mt-3 font-mono text-xs text-[var(--faint)]">{t("auth.devCode", { code: devCode })}</p>
            ) : null}
            {notice ? <p className="mt-3 text-sm text-[var(--muted)]">{notice}</p> : null}
            {error ? (
              <p className="mt-4 rounded-xl border border-[color-mix(in_srgb,var(--danger)_45%,transparent)] bg-[color-mix(in_srgb,var(--danger)_10%,transparent)] px-3.5 py-2.5 text-sm text-[var(--danger)]">
                {error}
              </p>
            ) : null}

            <button
              type="submit"
              disabled={busy || !canSubmit}
              className="mt-6 flex w-full items-center justify-center gap-2 rounded-full bg-[var(--accent)] px-4 py-2.5 text-sm font-semibold text-[var(--accent-fg)] transition hover:brightness-95 active:scale-[0.98] disabled:opacity-45"
            >
              {busy ? t("auth.processing") : forgotSent ? t("auth.reset") : t("auth.resend")}
              {!busy ? <ArrowRight size={15} weight="bold" /> : null}
            </button>

            <button
              type="button"
              onClick={() => {
                setStep("form");
                setError("");
                setNotice("");
                setForgotSent(false);
                setPassword("");
              }}
              className="mt-4 w-full text-center text-sm text-[var(--muted)] underline underline-offset-4 transition hover:text-[var(--fg)]"
            >
              {t("auth.back")}
            </button>
          </>
        ) : step === "otp" ? (
          <>
            <h1 className="mt-5 text-[22px] font-semibold tracking-tight">{t("auth.verifyTitle")}</h1>
            <p className="mt-1.5 text-sm text-[var(--muted)]">{t("auth.verifySub", { email: pendingEmail })}</p>

            <div className="mt-6">
              <label htmlFor="code" className={LABEL}>
                {t("auth.code")}
              </label>
              <input
                id="code"
                inputMode="numeric"
                autoComplete="one-time-code"
                maxLength={6}
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
                placeholder={t("auth.codePh")}
                className={`${FIELD} tracking-[0.5em]`}
              />
            </div>

            {notice ? <p className="mt-3 text-sm text-[var(--muted)]">{notice}</p> : null}
            {devCode ? <p className="mt-2 font-mono text-xs text-[var(--faint)]">{t("auth.devCode", { code: devCode })}</p> : null}
            {error ? (
              <p className="mt-4 rounded-xl border border-[color-mix(in_srgb,var(--danger)_45%,transparent)] bg-[color-mix(in_srgb,var(--danger)_10%,transparent)] px-3.5 py-2.5 text-sm text-[var(--danger)]">
                {error}
              </p>
            ) : null}

            <button
              type="submit"
              disabled={busy || !canSubmit}
              className="mt-6 flex w-full items-center justify-center gap-2 rounded-full bg-[var(--accent)] px-4 py-2.5 text-sm font-semibold text-[var(--accent-fg)] transition hover:brightness-95 active:scale-[0.98] disabled:opacity-45"
            >
              {busy ? t("auth.processing") : t("auth.verify")}
              {!busy ? <ArrowRight size={15} weight="bold" /> : null}
            </button>

            <div className="mt-4 flex items-center justify-between text-sm">
              <button
                type="button"
                onClick={() => void sendCode(pendingEmail)}
                className="text-[var(--muted)] underline underline-offset-4 transition hover:text-[var(--fg)]"
              >
                {t("auth.resend")}
              </button>
              <button
                type="button"
                onClick={() => {
                  setStep("form");
                  setError("");
                  setNotice("");
                }}
                className="text-[var(--muted)] underline underline-offset-4 transition hover:text-[var(--fg)]"
              >
                {t("auth.back")}
              </button>
            </div>
          </>
        ) : (
          <>
            <h1 className="mt-5 text-[22px] font-semibold tracking-tight">
              {isLogin ? t("auth.loginTitle") : t("auth.registerTitle")}
            </h1>
            <p className="mt-1.5 text-sm text-[var(--muted)]">
              {isLogin ? t("auth.loginSub") : t("auth.registerSub")}
            </p>

            {hasOauth ? (
              <div className="mt-6 space-y-2.5">
                {providers.google ? (
                  <a
                    href="/api/auth/google"
                    className="flex w-full items-center justify-center gap-2.5 rounded-full border border-[var(--border)] bg-[var(--bg)] px-4 py-2.5 text-sm font-medium text-[var(--fg)] transition hover:border-[var(--border-strong)] active:scale-[0.98]"
                  >
                    <GoogleIcon />
                    {t("auth.continueWith")} {t("auth.google")}
                  </a>
                ) : null}
                {providers.discord ? (
                  <a
                    href="/api/auth/discord"
                    className="flex w-full items-center justify-center gap-2.5 rounded-full border border-[var(--border)] bg-[var(--bg)] px-4 py-2.5 text-sm font-medium text-[var(--fg)] transition hover:border-[var(--border-strong)] active:scale-[0.98]"
                  >
                    <DiscordIcon />
                    {t("auth.continueWith")} {t("auth.discord")}
                  </a>
                ) : null}
                <div className="flex items-center gap-3 py-1 text-xs text-[var(--faint)]">
                  <span className="h-px flex-1 bg-[var(--border)]" />
                  {t("auth.or")}
                  <span className="h-px flex-1 bg-[var(--border)]" />
                </div>
              </div>
            ) : null}

            <div className="mt-4 space-y-4">
              {!isLogin ? (
                <div>
                  <label htmlFor="nickname" className={LABEL}>
                    {t("auth.nickname")}
                  </label>
                  <input
                    id="nickname"
                    value={nickname}
                    onChange={(e) => setNickname(e.target.value)}
                    autoComplete="nickname"
                    className={FIELD}
                    placeholder={t("auth.nicknamePh")}
                  />
                </div>
              ) : null}

              <div>
                <label htmlFor="email" className={LABEL}>
                  {t("auth.email")}
                </label>
                <input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  autoComplete="email"
                  className={FIELD}
                  placeholder={t("auth.emailPh")}
                />
              </div>

              <div>
                <div className="mb-1.5 flex items-center justify-between">
                  <label htmlFor="password" className="text-[13px] font-medium">
                    {t("auth.password")}
                  </label>
                  {isLogin ? (
                    <button
                      type="button"
                      onClick={() => {
                        setStep("forgot");
                        setError("");
                      }}
                      className="text-xs text-[var(--muted)] underline underline-offset-4 transition hover:text-[var(--fg)]"
                    >
                      {t("auth.forgot")}
                    </button>
                  ) : null}
                </div>
                <input
                  id="password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete={isLogin ? "current-password" : "new-password"}
                  className={FIELD}
                  placeholder={isLogin ? t("auth.passwordPh") : t("auth.passwordHint")}
                />
              </div>

              {!isLogin ? (
                <div>
                  <label htmlFor="confirm" className={LABEL}>
                    {t("auth.confirm")}
                  </label>
                  <input
                    id="confirm"
                    type="password"
                    value={confirm}
                    onChange={(e) => setConfirm(e.target.value)}
                    autoComplete="new-password"
                    className={FIELD}
                    placeholder={t("auth.confirmPh")}
                  />
                </div>
              ) : null}
            </div>

            {error ? (
              <p className="mt-4 rounded-xl border border-[color-mix(in_srgb,var(--danger)_45%,transparent)] bg-[color-mix(in_srgb,var(--danger)_10%,transparent)] px-3.5 py-2.5 text-sm text-[var(--danger)]">
                {error}
              </p>
            ) : null}

            <button
              type="submit"
              disabled={busy || !canSubmit}
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
          </>
        )}
      </form>
    </div>
  );
}
