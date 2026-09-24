// language: TypeScript, file: components/not-found-view.tsx, target: client (i18n + Phosphor)
"use client";

import Link from "next/link";
import { ArrowLeft } from "@phosphor-icons/react";
import { BrandMark } from "./sidebar";
import { useI18n } from "./i18n";

export default function NotFoundView() {
  const { t } = useI18n();
  return (
    <div className="flex flex-1 flex-col justify-center px-6 py-12">
      <div className="mx-auto w-full max-w-md">
        <BrandMark size={28} />
        <h1 className="mt-5 text-[24px] font-semibold tracking-tight">{t("chat.notFoundTitle")}</h1>
        <p className="mt-2 text-[15px] text-[var(--muted)]">{t("chat.notFoundSub")}</p>
        <Link
          href="/"
          className="mt-6 inline-flex items-center gap-2 rounded-full bg-[var(--accent)] px-4 py-2.5 text-sm font-semibold text-[var(--accent-fg)] transition hover:brightness-95 active:scale-[0.98]"
        >
          <ArrowLeft size={15} weight="bold" />
          {t("nav.newChat")}
        </Link>
      </div>
    </div>
  );
}
