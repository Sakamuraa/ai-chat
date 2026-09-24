// language: TypeScript, file: components/profile-modal.tsx, target: modal pengaturan di /#settings
"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { SignOut, X } from "@phosphor-icons/react";
import { useI18n } from "./i18n";
import { LANGS } from "@/lib/i18n";
import { BrandMark } from "./sidebar";

export type Me = {
  id: string;
  username: string;
  avatar_url: string | null;
  personality: string | null;
  memory_enabled: boolean;
  language: string;
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
