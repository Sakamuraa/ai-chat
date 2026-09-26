// language: TypeScript, file: components/profile-modal.tsx, target: modal pengaturan di /#settings
"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { SignOut, X } from "@phosphor-icons/react";
import { useI18n } from "./i18n";
import { LANGS } from "@/lib/i18n";
import { BrandMark } from "./sidebar";
import { TOKEN_OPTIONS, DURATION_OPTIONS, formatTokens } from "@/lib/sub-options";

export type Me = {
  id: string;
  username: string;
  email: string | null;
  avatar_url: string | null;
  personality: string | null;
  memory_enabled: boolean;
  language: string;
  is_admin: boolean;
};

function initials(name: string) {
  return name.slice(0, 2).toUpperCase();
}

export default function ProfileModal({
  me,
  onSaved,
  onLogout,
}: {
  me: Me | null;
  onSaved: (m: Me) => void;
  onLogout: () => void;
}) {
  const router = useRouter();
  const { t, lang, setLang } = useI18n();
  const [open, setOpen] = useState(false);
  const [username, setUsername] = useState("");
  const [avatar, setAvatar] = useState("");
  const [personality, setPersonality] = useState("");
  const [memory, setMemory] = useState(true);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<"" | "saved" | "failed">("");
  // ganti password via OTP
  const [cpOpen, setCpOpen] = useState(false);
  const [cpCode, setCpCode] = useState("");
  const [cpPw, setCpPw] = useState("");
  const [cpDev, setCpDev] = useState("");
  const [cpMsg, setCpMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [cpBusy, setCpBusy] = useState(false);

  // langganan + kuota
  const [quota, setQuota] = useState<{
    dailyLimit: number;
    remaining: number | null;
    unlimited: boolean;
    sub: { tokenLimit: number | null; remaining: number | null; validUntil: string; sourceCode: string | null } | null;
  } | null>(null);
  const [redeemCode, setRedeemCode] = useState("");
  const [redeemMsg, setRedeemMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [plan, setPlan] = useState<string>("free");
  const [pickPlan, setPickPlan] = useState<"free" | "pro" | "max">("free");
  const [pickToken, setPickToken] = useState<number | null>(TOKEN_OPTIONS[0].value);
  const [pickHours, setPickHours] = useState<number>(DURATION_OPTIONS[0].hours);
  const [newCode, setNewCode] = useState("");
  const [codes, setCodes] = useState<{
    code: string;
    token_limit: number | null;
    duration_hours: number;
    plan: string | null;
    revoked: boolean;
    redeemed_at: string | null;
    redeemer: string | null;
    expired?: boolean;
  }[]>([]);

  // hash #settings = buka/tutup modal (tanpa route baru)
  useEffect(() => {
    const sync = () => setOpen(window.location.hash === "#settings");
    sync();
    window.addEventListener("hashchange", sync);
    return () => window.removeEventListener("hashchange", sync);
  }, []);

  useEffect(() => {
    if (!me) return;
    setUsername(me.username);
    setAvatar(me.avatar_url ?? "");
    setPersonality(me.personality ?? "");
    setMemory(me.memory_enabled);
  }, [me]);

  const loadQuota = async () => {
    try {
      const res = await fetch("/api/subscriptions/me");
      if (!res.ok) return;
      const b = (await res.json()) as {
        remaining: number | null;
        unlimited: boolean;
        dailyLimit: number;
        plan?: string;
        sub: { tokenLimit: number | null; remaining: number | null; validUntil: string; sourceCode: string | null } | null;
      };
      if (b.plan) setPlan(b.plan);
      setQuota({ dailyLimit: b.dailyLimit, remaining: b.remaining, unlimited: b.unlimited, sub: b.sub });
    } catch {
      /* diam */
    }
  };

  const loadCodes = async () => {
    try {
      const res = await fetch("/api/subscriptions/codes");
      if (!res.ok) return;
      const b = (await res.json()) as { codes: typeof codes };
      setCodes(b.codes);
    } catch {
      /* diam */
    }
  };

  async function redeemSub() {
    if (!redeemCode.trim() || busy) return;
    setBusy(true);
    setRedeemMsg(null);
    try {
      const res = await fetch("/api/subscriptions/redeem", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ code: redeemCode }),
      });
      if (res.ok) {
        setRedeemCode("");
        setRedeemMsg({ ok: true, text: t("sub.redeemOk") });
        await loadQuota();
        return;
      }
      const body = (await res.json().catch(() => ({}))) as { error?: string };
      const map: Record<string, string> = {
        not_found: t("sub.errNotFound"),
        used: t("sub.errUsed"),
        revoked: t("sub.errRevoked"),
      };
      setRedeemMsg({ ok: false, text: map[body.error ?? ""] ?? t("sub.errGeneric") });
    } finally {
      setBusy(false);
    }
  }

  async function createSubCode() {
    if (busy) return;
    setBusy(true);
    try {
      const res = await fetch("/api/subscriptions/codes", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ tokenLimit: pickToken, durationHours: pickHours, plan: pickPlan }),
      });
      if (res.ok) {
        const b = (await res.json()) as { code: string };
        setNewCode(b.code);
        await loadCodes();
      }
    } finally {
      setBusy(false);
    }
  }

  async function revokeSubCode(code: string) {
    await fetch(`/api/subscriptions/codes/${encodeURIComponent(code)}`, { method: "DELETE" });
    await loadCodes();
  }

  async function removeSubCode(code: string) {
    await fetch(`/api/subscriptions/codes/${encodeURIComponent(code)}?remove=true`, { method: "DELETE" });
    await loadCodes();
  }

  useEffect(() => {
    if (!open) return;
    void loadQuota();
    if (me?.is_admin) void loadCodes();
    // sisa token ditarik ulang tiap 5 dtk supaya angkanya hidup saat dipantau
    const iv = window.setInterval(() => void loadQuota(), 5000);
    return () => window.clearInterval(iv);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, me?.is_admin]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && open && close();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  function close() {
    history.replaceState(null, "", window.location.pathname + window.location.search);
    setOpen(false);
  }

  async function save() {
    if (!me || busy) return;
    setBusy(true);
    setStatus("");
    try {
      const res = await fetch("/api/me", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          username,
          avatar_url: avatar.trim() || null,
          personality: personality.trim() || null,
          memory_enabled: memory,
          language: lang,
        }),
      });
      if (!res.ok) {
        setStatus("failed");
        return;
      }
      const body = (await res.json()) as { user: Me };
      onSaved(body.user);
      setStatus("saved");
      window.dispatchEvent(new Event("profile-changed"));
    } finally {
      setBusy(false);
    }
  }

  async function cpSend() {
    if (cpBusy) return;
    setCpBusy(true);
    setCpMsg(null);
    try {
      const res = await fetch("/api/auth/change-password", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "send" }),
      });
      const body = (await res.json().catch(() => ({}))) as { error?: string; devCode?: string };
      if (!res.ok) {
        setCpMsg({
          ok: false,
          text:
            body.error === "no_email"
              ? t("auth.noEmail")
              : body.error === "too_many_attempts"
                ? t("auth.errRate")
                : t("auth.errMail"),
        });
        return;
      }
      setCpDev(body.devCode ?? "");
      setCpMsg({ ok: true, text: t("profile.cpSent") });
    } finally {
      setCpBusy(false);
    }
  }

  async function cpApply() {
    if (cpBusy) return;
    setCpBusy(true);
    setCpMsg(null);
    try {
      const res = await fetch("/api/auth/change-password", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ code: cpCode, password: cpPw }),
      });
      const body = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        const map: Record<string, string> = {
          wrong: t("auth.errWrong"),
          expired: t("auth.errExpired"),
          attempts: t("auth.errAttempts"),
          too_many_attempts: t("auth.errRate"),
          invalid_body: t("auth.errGeneric"),
        };
        setCpMsg({ ok: false, text: map[body.error ?? ""] ?? t("auth.errGeneric") });
        return;
      }
      setCpMsg({ ok: true, text: t("profile.cpChanged") });
      setCpOpen(false);
      setCpCode("");
      setCpPw("");
      setCpDev("");
    } finally {
      setCpBusy(false);
    }
  }

  if (!open || !me) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center" role="dialog" aria-modal="true">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-[2px]" onClick={close} />

      <div className="fade-up relative z-10 max-h-[92dvh] w-full max-w-lg overflow-y-auto rounded-t-2xl border border-[var(--border)] bg-[var(--panel)] p-6 shadow-[0_24px_70px_-20px_rgba(0,0,0,0.45)] sm:rounded-2xl">
        <div className="mb-5 flex items-start gap-3">
          <BrandMark size={34} />
          <div className="min-w-0 flex-1">
            <h2 className="text-lg font-semibold tracking-tight">{t("profile.title")}</h2>
            <p className="truncate text-sm text-[var(--muted)]">@{me.username}</p>
          </div>
          <button
            onClick={close}
            aria-label={t("profile.close")}
            className="rounded-full p-2 text-[var(--muted)] transition hover:bg-[var(--border)] hover:text-[var(--fg)]"
          >
            <X size={16} />
          </button>
        </div>

        <div className="space-y-5">
          <div className="flex items-center gap-4">
            <span className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--sidebar)] text-lg font-semibold text-[var(--muted)]">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              {avatar ? (
                <img src={avatar} alt="" className="h-full w-full object-cover" onError={(e) => (e.currentTarget.style.display = "none")} />
              ) : (
                initials(username || "?")
              )}
            </span>
            <div className="min-w-0 flex-1">
              <label className="mb-1.5 block text-[13px] font-medium">{t("profile.avatar")}</label>
              <input
                value={avatar}
                onChange={(e) => setAvatar(e.target.value)}
                placeholder="https://…"
                className="w-full rounded-xl border border-[var(--border)] bg-[var(--bg)] px-3.5 py-2.5 text-sm text-[var(--fg)] placeholder:text-[var(--muted)] focus:border-[var(--border-strong)]"
              />
              <p className="mt-1 text-xs text-[var(--muted)]">{t("profile.avatarHint")}</p>
            </div>
          </div>

          <div>
            <label htmlFor="pf-username" className="mb-1.5 block text-[13px] font-medium">
              {t("profile.username")}
            </label>
            <input
              id="pf-username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className="w-full rounded-xl border border-[var(--border)] bg-[var(--bg)] px-3.5 py-2.5 text-sm text-[var(--fg)] focus:border-[var(--border-strong)]"
            />
          </div>

          <div>
            <label htmlFor="pf-email" className="mb-1.5 block text-[13px] font-medium">
              {t("profile.email")}
            </label>
            <input
              id="pf-email"
              readOnly
              value={me.email ?? ""}
              placeholder={t("profile.noEmail")}
              className="w-full cursor-default rounded-xl border border-[var(--border)] bg-[var(--sidebar)] px-3.5 py-2.5 text-sm text-[var(--muted)]"
            />
            {me.email ? (
              <div className="mt-2">
                {cpOpen ? (
                  <div className="rounded-xl border border-[var(--border)] bg-[var(--sidebar)] p-3.5">
                    <p className="text-sm font-medium">{t("profile.cpTitle")}</p>
                    <p className="mt-1 text-xs text-[var(--muted)]">{t("profile.cpHint")}</p>
                    <div className="mt-3 space-y-2">
                      <input
                        value={cpCode}
                        onChange={(e) => setCpCode(e.target.value.replace(/\D/g, ""))}
                        maxLength={6}
                        inputMode="numeric"
                        placeholder={t("auth.codePh")}
                        className="w-full rounded-xl border border-[var(--border)] bg-[var(--bg)] px-3.5 py-2.5 font-mono tracking-[0.4em] text-sm text-[var(--fg)] placeholder:font-sans placeholder:tracking-normal placeholder:text-[var(--muted)] focus:border-[var(--border-strong)]"
                      />
                      <input
                        type="password"
                        value={cpPw}
                        onChange={(e) => setCpPw(e.target.value)}
                        placeholder={t("auth.passwordHint")}
                        className="w-full rounded-xl border border-[var(--border)] bg-[var(--bg)] px-3.5 py-2.5 text-sm text-[var(--fg)] placeholder:text-[var(--muted)] focus:border-[var(--border-strong)]"
                      />
                    </div>
                    {cpDev ? <p className="mt-2 font-mono text-[11px] text-[var(--faint)]">{t("auth.devCode", { code: cpDev })}</p> : null}
                    {cpMsg ? (
                      <p className={`mt-2 text-xs ${cpMsg.ok ? "text-[var(--muted)]" : "text-[var(--danger)]"}`}>{cpMsg.text}</p>
                    ) : null}
                    <div className="mt-3 flex gap-2">
                      <button
                        type="button"
                        onClick={() => void cpApply()}
                        disabled={cpBusy || !/^\d{6}$/.test(cpCode) || cpPw.length < 8}
                        className="rounded-xl bg-[var(--accent)] px-4 py-2 text-sm font-semibold text-[var(--accent-fg)] transition hover:brightness-95 disabled:opacity-45"
                      >
                        {t("auth.verify")}
                      </button>
                      <button
                        type="button"
                        onClick={() => void cpSend()}
                        disabled={cpBusy}
                        className="rounded-xl border border-[var(--border)] px-4 py-2 text-sm font-medium text-[var(--muted)] transition hover:text-[var(--fg)] disabled:opacity-45"
                      >
                        {t("auth.resend")}
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setCpOpen(false);
                          setCpMsg(null);
                        }}
                        className="rounded-xl px-3 py-2 text-sm text-[var(--muted)] transition hover:text-[var(--fg)]"
                      >
                        {t("auth.back")}
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="mt-2 flex items-center justify-between gap-3">
                    <p className="text-xs text-[var(--muted)]">{t("profile.cpHint")}</p>
                    <button
                      type="button"
                      onClick={() => {
                        setCpOpen(true);
                        setCpMsg(null);
                        void cpSend();
                      }}
                      className="shrink-0 rounded-full border border-[var(--border)] px-3.5 py-1.5 text-xs font-medium text-[var(--fg)] transition hover:border-[var(--border-strong)]"
                    >
                      {t("profile.changePw")}
                    </button>
                  </div>
                )}
              </div>
            ) : null}
          </div>

          <div>
            <label htmlFor="pf-personality" className="mb-1.5 block text-[13px] font-medium">
              {t("profile.personality")}
            </label>
            <textarea
              id="pf-personality"
              value={personality}
              onChange={(e) => setPersonality(e.target.value)}
              rows={3}
              placeholder={t("profile.personalityHint")}
              className="w-full resize-none rounded-xl border border-[var(--border)] bg-[var(--bg)] px-3.5 py-2.5 text-sm text-[var(--fg)] placeholder:text-[var(--muted)] focus:border-[var(--border-strong)]"
            />
            <p className="mt-1 text-xs text-[var(--muted)]">{t("profile.personalityHint")}</p>
          </div>

          <div className="rounded-xl border border-[var(--border)] bg-[var(--sidebar)] p-4">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-sm font-medium">{t("profile.memory")}</p>
                <p className="mt-1 text-xs leading-relaxed text-[var(--muted)]">{t("profile.memoryDesc")}</p>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={memory}
                onClick={() => setMemory((v) => !v)}
                className={`relative h-6 w-11 shrink-0 rounded-full transition ${memory ? "bg-[var(--accent)]" : "bg-[var(--border-strong)]"}`}
              >
                <span
                  className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all ${memory ? "left-[22px]" : "left-0.5"}`}
                />
              </button>
            </div>
          </div>

          <div>
            <label htmlFor="pf-lang" className="mb-1.5 block text-[13px] font-medium">
              {t("profile.language")}
            </label>
            <div id="pf-lang" className="flex gap-2">
              {LANGS.map((l) => (
                <button
                  key={l.code}
                  type="button"
                  onClick={() => setLang(l.code)}
                  className={`rounded-full border px-4 py-2 text-sm font-medium transition ${
                    lang === l.code
                      ? "border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--fg)]"
                      : "border-[var(--border)] text-[var(--muted)] hover:text-[var(--fg)]"
                  }`}
                >
                  {l.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* ===== Langganan: info + redeem (semua akun) ===== */}
        <div className="mt-5 rounded-xl border border-[var(--border)] bg-[var(--sidebar)] p-4">
          <p className="text-sm font-medium">{t("sub.section")}</p>
          <p className="mt-1 text-xs text-[var(--muted)]">
            {t("sub.dailyQuota", { n: (quota?.dailyLimit ?? 10_000_000).toLocaleString("id-ID") })}
          </p>
          <p className="mt-1 flex items-center gap-2 text-xs text-[var(--muted)]">
            <span className="rounded-full border border-[var(--border)] bg-[var(--panel)] px-2 py-0.5 text-[11px] font-medium uppercase tracking-wide text-[var(--fg)]">
              {t("sub.plan")}: {plan === "pro" ? t("sub.planPro") : plan === "max" ? t("sub.planMax") : t("sub.planFree")}
            </span>
            <span data-testid="live-remaining">
              {t("sub.liveRemaining")}:{" "}
              <b className="text-[var(--fg)]">
                {quota?.unlimited
                  ? t("sub.unlimited")
                  : (quota?.remaining ?? 0).toLocaleString("id-ID")}
              </b>
            </span>
          </p>

          {quota?.sub ? (
            <div className="mt-3 space-y-1 rounded-xl border border-[var(--border)] bg-[var(--panel)] p-3 text-sm">
              <p className="font-medium text-[var(--fg)]">{t("sub.active")}</p>
              <p className="text-xs text-[var(--muted)]">
                {t("sub.tokens")}: <b>{formatTokens(quota.sub.tokenLimit)}</b>
                {quota.sub.tokenLimit === null ? "" : ` · ${t("sub.remaining")}: ${formatTokens(quota.sub.remaining)}`}
              </p>
              <p className="text-xs text-[var(--muted)]">
                {t("sub.validUntil")}: {new Date(quota.sub.validUntil).toLocaleString("id-ID")}
              </p>
              {quota.sub.sourceCode ? (
                <p className="text-xs text-[var(--faint)]">
                  {t("sub.source")}: {quota.sub.sourceCode}
                </p>
              ) : null}
            </div>
          ) : (
            <p className="mt-3 text-xs text-[var(--muted)]">{t("sub.none")}</p>
          )}

          <label htmlFor="pf-code" className="mt-4 block text-[13px] font-medium">
            {t("sub.redeemTitle")}
          </label>
          <div className="mt-1.5 flex gap-2">
            <input
              id="pf-code"
              value={redeemCode}
              onChange={(e) => setRedeemCode(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && void redeemSub()}
              placeholder={t("sub.redeemPh")}
              className="min-w-0 flex-1 rounded-xl border border-[var(--border)] bg-[var(--bg)] px-3.5 py-2.5 font-mono text-sm uppercase text-[var(--fg)] placeholder:font-sans placeholder:normal-case placeholder:text-[var(--muted)] focus:border-[var(--border-strong)]"
            />
            <button
              onClick={() => void redeemSub()}
              disabled={busy || !redeemCode.trim()}
              className="shrink-0 rounded-xl bg-[var(--accent)] px-4 py-2.5 text-sm font-semibold text-[var(--accent-fg)] transition hover:brightness-95 active:scale-[0.98] disabled:opacity-45"
            >
              {t("sub.redeemBtn")}
            </button>
          </div>
          {redeemMsg ? (
            <p className={`mt-2 text-xs ${redeemMsg.ok ? "text-[var(--muted)]" : "text-[var(--danger)]"}`}>
              {redeemMsg.text}
            </p>
          ) : null}
        </div>

        {/* ===== Kelola kode: khusus admin (ujicoba) ===== */}
        {me.is_admin ? (
          <div className="rounded-xl border border-[var(--border)] bg-[var(--sidebar)] p-4">
            <p className="text-sm font-medium">{t("sub.manage")}</p>

            <p className="mt-3 text-xs text-[var(--muted)]">{t("sub.tokenPick")}</p>
            <div className="mt-1.5 flex flex-wrap gap-2">
              {TOKEN_OPTIONS.map((o) => (
                <button
                  key={String(o.value)}
                  onClick={() => setPickToken(o.value)}
                  className={`rounded-full border px-3 py-1.5 text-xs font-medium transition ${
                    pickToken === o.value
                      ? "border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--fg)]"
                      : "border-[var(--border)] text-[var(--muted)] hover:text-[var(--fg)]"
                  }`}
                >
                  {o.label}
                </button>
              ))}
            </div>

            <p className="mt-3 text-xs text-[var(--muted)]">{t("sub.planPick")}</p>
            <div className="mt-1.5 flex flex-wrap gap-2">
              {(["free", "pro", "max"] as const).map((pl) => (
                <button
                  key={pl}
                  onClick={() => setPickPlan(pl)}
                  className={`rounded-full border px-3 py-1.5 text-xs font-medium transition ${
                    pickPlan === pl
                      ? "border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--fg)]"
                      : "border-[var(--border)] text-[var(--muted)] hover:text-[var(--fg)]"
                  }`}
                >
                  {pl === "free" ? t("sub.planFree") : pl === "pro" ? t("sub.planPro") : t("sub.planMax")}
                </button>
              ))}
            </div>

            <p className="mt-3 text-xs text-[var(--muted)]">{t("sub.durPick")}</p>
            <div className="mt-1.5 flex flex-wrap gap-2">
              {DURATION_OPTIONS.map((o) => (
                <button
                  key={o.hours}
                  onClick={() => setPickHours(o.hours)}
                  className={`rounded-full border px-3 py-1.5 text-xs font-medium transition ${
                    pickHours === o.hours
                      ? "border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--fg)]"
                      : "border-[var(--border)] text-[var(--muted)] hover:text-[var(--fg)]"
                  }`}
                >
                  {o.label}
                </button>
              ))}
            </div>

            <div className="mt-4 flex items-center gap-2">
              <button
                onClick={() => void createSubCode()}
                disabled={busy}
                className="rounded-full bg-[var(--accent)] px-4 py-2 text-xs font-semibold text-[var(--accent-fg)] transition hover:brightness-95 active:scale-[0.98] disabled:opacity-45"
              >
                {t("sub.create")}
              </button>
              {newCode ? (
                <span className="flex min-w-0 items-center gap-2 rounded-xl border border-[var(--border)] bg-[var(--panel)] px-3 py-1.5 font-mono text-xs text-[var(--fg)]">
                  <span className="truncate">{newCode}</span>
                  <button
                    onClick={() => {
                      navigator.clipboard.writeText(newCode);
                    }}
                    className="shrink-0 text-[var(--muted)] transition hover:text-[var(--fg)]"
                    title={t("sub.copy")}
                  >
                    {t("sub.copy")}
                  </button>
                </span>
              ) : null}
            </div>

            <p className="mt-4 text-xs text-[var(--muted)]">{t("sub.list")}</p>
            <div className="mt-1.5 max-h-[190px] space-y-1.5 overflow-y-auto">
              {codes.length === 0 ? (
                <p className="text-xs text-[var(--faint)]">{t("sub.noneYet")}</p>
              ) : (
                codes.map((c) => {
                  const dur = DURATION_OPTIONS.find((d) => d.hours === c.duration_hours);
                  const state = c.revoked ? "revoked" : c.expired ? "expired" : c.redeemed_at ? "used" : "unused";
                  const label =
                    state === "revoked"
                      ? t("sub.stRevoked")
                      : state === "expired"
                        ? t("sub.stExpired")
                        : state === "used"
                          ? t("sub.stUsed")
                          : t("sub.stUnused");
                  return (
                    <div
                      key={c.code}
                      className="flex items-center gap-2 rounded-xl border border-[var(--border)] bg-[var(--panel)] px-3 py-2 text-xs"
                    >
                      <span className="min-w-0 flex-1 truncate font-mono text-[var(--fg)]">{c.code}</span>
                      <span className="shrink-0 text-[var(--muted)]">
                        {c.plan && c.plan !== "free"
                          ? `${c.plan.toUpperCase()} · `
                          : ""}
                        {formatTokens(c.token_limit)} · {dur?.label ?? `${c.duration_hours}h`}
                      </span>
                      <span
                        className={`shrink-0 ${
                          state === "unused"
                            ? "text-[#a16207] dark:text-[var(--accent)]"
                            : state === "expired" || state === "used"
                              ? "text-[var(--muted)]"
                              : "text-[var(--danger)]"
                        }`}
                      >
                        {label}
                        {c.redeemer ? ` · ${t("sub.usedBy", { name: c.redeemer })}` : ""}
                      </span>
                      {state === "unused" || state === "used" ? (
                        <button
                          onClick={() => void revokeSubCode(c.code)}
                          className="shrink-0 text-[var(--faint)] transition hover:text-[var(--danger)]"
                          title={t("sub.revoke")}
                        >
                          {t("sub.revoke")}
                        </button>
                      ) : null}
                      {state === "expired" || state === "revoked" ? (
                        <button
                          onClick={() => void removeSubCode(c.code)}
                          className="shrink-0 text-[var(--faint)] transition hover:text-[var(--danger)]"
                          title={t("sub.remove")}
                        >
                          {t("sub.remove")}
                        </button>
                      ) : null}
                    </div>
                  );
                })
              )}
            </div>
          </div>
        ) : null}

        <div className="mt-6 flex items-center gap-3">
          <button
            onClick={() => void save()}
            disabled={busy || username.trim().length < 3}
            className="rounded-full bg-[var(--accent)] px-5 py-2.5 text-sm font-semibold text-[var(--accent-fg)] transition hover:brightness-95 active:scale-[0.98] disabled:opacity-45"
          >
            {busy ? t("auth.processing") : t("profile.save")}
          </button>
          {status === "saved" ? (
            <span className="text-sm text-[var(--muted)]">{t("profile.saved")}</span>
          ) : status === "failed" ? (
            <span className="text-sm text-[var(--danger)]">{t("profile.failed")}</span>
          ) : null}

          <button
            onClick={() => {
              close();
              void onLogout();
            }}
            className="ml-auto flex items-center gap-2 rounded-full border border-[var(--border)] px-4 py-2.5 text-sm font-medium text-[var(--muted)] transition hover:text-[var(--fg)]"
          >
            <SignOut size={15} />
            {t("nav.logout")}
          </button>
        </div>

        <button
          onClick={() => {
            close();
            router.push("/");
          }}
          className="sr-only"
        >
          {t("profile.close")}
        </button>
      </div>
    </div>
  );
}
