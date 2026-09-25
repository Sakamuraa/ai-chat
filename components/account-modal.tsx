// language: TypeScript (React), file: components/account-modal.tsx, target: Next.js app ai.onheil.fun
// Modal akun ala ChatGPT: ganti akun (submenu turunan), upgrade, pengaturan, bantuan, keluar.
"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowsLeftRight,
  ArrowLeft,
  BookOpen,
  Check,
  FileText,
  Gear,
  Lifebuoy,
  Plus,
  ShieldCheck,
  SignOut,
  Sparkle,
  UserPlus,
  X,
} from "@phosphor-icons/react";
import { useI18n } from "./i18n";
import { PLANS, type Plan } from "@/lib/plans";

/** Invite Discord The Onheil Foundation (permintaan Manuel, 2026-09-26). */
const DISCORD_UPGRADE = "https://discord.gg/ytBsd5JSXB";

type Me = { id?: string; username?: string; email?: string | null; avatar_url?: string | null; plan?: string | null };
type Slot = { id: string; username: string; email: string | null; avatarUrl: string | null; current: boolean };

/** Bulatan akun: foto profil kalau ada, kalau tidak huruf awal nama. */
function Avatar({ url, name, size = 36 }: { url?: string | null; name?: string; size?: number }) {
  const initial = ((name || "").trim()[0] || "O").toUpperCase();
  return (
    <span
      className="flex shrink-0 items-center justify-center overflow-hidden rounded-full bg-[color-mix(in_srgb,var(--accent)_26%,var(--border))] font-semibold text-[var(--fg)]"
      style={{ width: size, height: size, fontSize: Math.round(size * 0.4) }}
    >
      {url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={url} alt="" className="h-full w-full object-cover" onError={(e) => ((e.currentTarget as HTMLImageElement).style.display = "none")} />
      ) : (
        initial
      )}
    </span>
  );
}

export function AccountModal({
  open,
  onClose,
  onSettings,
  onLogout,
}: {
  open: boolean;
  onClose: () => void;
  onSettings: () => void;
  onLogout: () => void;
}) {
  const { t } = useI18n();
  const router = useRouter();
  const [me, setMe] = useState<Me | null>(null);
  const [view, setView] = useState<"main" | "switch">("main");
  const [slots, setSlots] = useState<Slot[]>([]);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    let alive = true;
    fetch("/api/me")
      .then((r) => (r.ok ? r.json() : null))
      .then((b: { user?: Me } | null) => {
        if (alive && b?.user) setMe(b.user);
      })
      .catch(() => undefined);
    // paket efektif (akun + langganan aktif) -> label badge
    fetch("/api/subscriptions/me")
      .then((r) => (r.ok ? r.json() : null))
      .then((b: { plan?: string } | null) => {
        if (alive && b?.plan) setMe((prev) => ({ ...(prev ?? {}), plan: b.plan ?? null }));
      })
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [open]);

  // setiap kali modal dibuka, kembali ke layar utama
  useEffect(() => {
    if (open) setView("main");
  }, [open]);

  // tutup dengan Esc
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  function openSwitch() {
    setView("switch");
    setBusy(true);
    fetch("/api/auth/accounts")
      .then((r) => (r.ok ? r.json() : null))
      .then((b: { accounts?: Slot[] } | null) => {
        if (b?.accounts) setSlots(b.accounts);
      })
      .catch(() => undefined)
      .finally(() => setBusy(false));
  }

  function switchTo(id: string) {
    if (busy) return;
    setBusy(true);
    fetch("/api/auth/switch", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ userId: id }),
    })
      .then((r) => {
        if (r.ok) window.location.reload();
        else setBusy(false);
      })
      .catch(() => setBusy(false));
  }

  if (!open) return null;

  const planId: Plan = (PLANS.some((p) => p.id === me?.plan) ? me?.plan : "free") as Plan;
  const planLabel = PLANS.find((p) => p.id === planId)?.label ?? "Standard";

  const row = (
    icon: React.ReactNode,
    label: string,
    onClick: () => void,
    opts?: { external?: boolean; tone?: "accent" | "danger" },
  ) => (
    <button
      key={label}
      onClick={onClick}
      className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm transition hover:bg-[var(--border)]/60 ${
        opts?.tone === "accent"
          ? "text-[var(--accent)] hover:text-[var(--accent)]"
          : opts?.tone === "danger"
            ? "text-[var(--danger)] hover:text-[var(--danger)]"
            : "text-[var(--fg)]"
      }`}
    >
      <span className="shrink-0 opacity-80">{icon}</span>
      <span className="flex-1 truncate">{label}</span>
      {opts?.external ? <span className="text-[11px] text-[var(--faint)]">buka</span> : null}
    </button>
  );

  // submenu "Ganti akun": daftar sesi yang tersimpan + tambah akun
  if (view === "switch") {
    return (
      <div
        className="fixed inset-0 z-50 flex items-end justify-center pb-12 sm:items-center sm:pb-12"
        role="dialog"
        aria-modal="true"
        aria-label={t("account.switch")}
        onClick={onClose}
      >
        <div className="absolute inset-0 bg-black/55" />
        <div
          className="fade-up relative z-10 w-full max-w-[340px] rounded-t-2xl border border-[var(--border)] bg-[var(--panel)] p-2 shadow-[0_24px_70px_-20px_rgba(0,0,0,0.45)] sm:rounded-2xl"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex items-center gap-2 px-2 pb-1 pt-2">
            <button
              onClick={() => setView("main")}
              aria-label={t("account.back")}
              className="rounded-full p-1.5 text-[var(--muted)] transition hover:bg-[var(--border)] hover:text-[var(--fg)]"
            >
              <ArrowLeft size={16} weight="bold" />
            </button>
            <span className="text-sm font-medium">{t("account.switch")}</span>
            <button
              onClick={onClose}
              aria-label={t("nav.close")}
              className="ml-auto rounded-full p-1.5 text-[var(--muted)] transition hover:bg-[var(--border)] hover:text-[var(--fg)]"
            >
              <X size={14} weight="bold" />
            </button>
          </div>

          <div className="my-1 h-px bg-[var(--border)]" />

          <div className="max-h-[46dvh] space-y-0.5 overflow-y-auto overscroll-contain">
            {busy && slots.length === 0 ? (
              <p className="px-3 py-3 text-[13px] text-[var(--faint)]">…</p>
            ) : null}
            {slots.map((s) => (
              <button
                key={s.id}
                onClick={() => (s.current ? onClose() : switchTo(s.id))}
                className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition hover:bg-[var(--border)]/60"
              >
                <Avatar url={s.avatarUrl} name={s.username} size={32} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium text-[var(--fg)]">{s.username}</span>
                  <span className="block truncate text-xs text-[var(--muted)]">{s.email || "—"}</span>
                </span>
                {s.current ? <Check size={16} className="shrink-0 text-[var(--accent)]" weight="bold" /> : null}
              </button>
            ))}
          </div>

          <div className="my-1 h-px bg-[var(--border)]" />

          {row(
            <UserPlus size={16} />,
            t("account.add"),
            () => {
              onClose();
              router.push("/login?from=switch");
            },
          )}

          <button
            onClick={() => setView("main")}
            className="mt-1 w-full rounded-xl px-3 py-2.5 text-center text-sm text-[var(--muted)] transition hover:bg-[var(--border)]/60 hover:text-[var(--fg)]"
          >
            {t("account.cancel")}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center pb-12 sm:items-center sm:pb-12"
      role="dialog"
      aria-modal="true"
      aria-label={t("account.title")}
      onClick={onClose}
    >
      <div className="absolute inset-0 bg-black/55" />
      <div
        className="fade-up relative z-10 w-full max-w-[340px] rounded-t-2xl border border-[var(--border)] bg-[var(--panel)] p-2 shadow-[0_24px_70px_-20px_rgba(0,0,0,0.45)] sm:rounded-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* kepala akun */}
        <div className="flex items-center gap-3 px-3 pb-2 pt-2.5">
          <Avatar url={me?.avatar_url} name={me?.username} size={36} />
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm font-medium">{me?.username || "…"}</span>
            <span className="block truncate text-xs text-[var(--muted)]">
              {me?.email || planLabel}
            </span>
          </span>
          <span className="shrink-0 rounded-full border border-[var(--border)] px-2 py-0.5 text-[11px] font-medium text-[var(--muted)]">
            {planLabel}
          </span>
          <button
            onClick={onClose}
            aria-label={t("nav.close")}
            className="rounded-full p-1 text-[var(--muted)] transition hover:bg-[var(--border)] hover:text-[var(--fg)]"
          >
            <X size={14} weight="bold" />
          </button>
        </div>

        <div className="my-1 h-px bg-[var(--border)]" />

        <div className="space-y-0.5">
          {row(
            <ArrowsLeftRight size={16} />,
            t("account.switch"),
            () => {
              openSwitch();
            },
          )}
          {row(
            <Sparkle size={16} />,
            t("account.upgrade"),
            () => window.open(DISCORD_UPGRADE, "_blank", "noopener,noreferrer"),
            { external: true, tone: "accent" },
          )}
          {row(
            <Gear size={16} />,
            t("account.settings"),
            () => {
              onClose();
              onSettings();
            },
          )}
        </div>

        <div className="my-1 h-px bg-[var(--border)]" />

        <div className="space-y-0.5">
          <p className="flex items-center gap-3 px-3 pb-1 pt-1 text-[11px] font-medium uppercase tracking-[0.14em] text-[var(--faint)]">
            <Lifebuoy size={14} />
            {t("account.help")}
          </p>
          {row(
            <BookOpen size={16} />,
            t("account.docs"),
            () => {
              onClose();
              router.push("/docs");
            },
          )}
          {row(
            <ShieldCheck size={16} />,
            t("account.privacy"),
            () => {
              onClose();
              router.push("/docs/privacy");
            },
          )}
          {row(
            <FileText size={16} />,
            t("account.terms"),
            () => {
              onClose();
              router.push("/docs/terms");
            },
          )}
        </div>

        <div className="my-1 h-px bg-[var(--border)]" />

        {row(<SignOut size={16} />, t("account.logout"), onLogout, { tone: "danger" })}
      </div>
    </div>
  );
}
