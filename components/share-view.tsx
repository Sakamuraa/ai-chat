// language: TypeScript, file: components/share-view.tsx, target: tampilan tautan bagikan (publik, hanya-baca)
"use client";

import ChatView, { type Msg } from "./chat-view";
import { useI18n } from "./i18n";

export default function ShareView({
  sessionId,
  title,
  model,
  initialMessages,
}: {
  sessionId: string;
  title: string;
  model: string;
  initialMessages: Msg[];
}) {
  const { t } = useI18n();
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <ChatView
        sessionId={sessionId}
        title={title}
        model={model}
        initialMessages={initialMessages}
        readOnly
        owner={false}
      />
      <p className="border-t border-[var(--border)] px-4 py-2 text-center text-[11px] text-[var(--faint)]">
        {t("share.footer")}
      </p>
    </div>
  );
}
