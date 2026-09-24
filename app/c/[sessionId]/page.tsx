// language: TypeScript, file: app/c/[sessionId]/page.tsx, target: Next.js App Router (server component)
import { redirect, notFound } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import { db } from "@/lib/db";
import ChatView, { type Msg } from "@/components/chat-view";
import { slimAttachments, type Attachment } from "@/lib/attachments";
import { isUuid } from "@/lib/uuid";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ sessionId: string }> };

export default async function SessionPage({ params }: Props) {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  const { sessionId } = await params;

  // sesi baru: belum ada row, dibuat saat pesan pertama dikirim
  if (sessionId === "new") {
    return <ChatView key="new" sessionId="new" title="New chat" model="" initialMessages={[]} owner />;
  }

  // bukan uuid (mis. /c/none) -> 404, jangan biarkan Postgres 22P02 -> 500
  if (!isUuid(sessionId)) notFound();

  const sessions = (await db()`
    SELECT id, title, model FROM sessions WHERE id = ${sessionId} AND user_id = ${user.id}
  `) as unknown as { id: string; title: string; model: string }[];
  if (!sessions[0]) {
    // Bukan milik user ini. Kalau sesi itu sedang dibagikan, alihkan ke tampilan
    // hanya-baca (/s/) — dulu balik 404 walau share_enabled=true.
    // Kalau tidak dibagikan, tetap 404 supaya keberadaan sesi orang tak bocor.
    const shared = (await db()`
      SELECT id FROM sessions WHERE id = ${sessionId} AND share_enabled = true
    `) as unknown as { id: string }[];
    if (shared[0]) redirect(`/s/${shared[0].id}`);
    notFound();
  }

  const messages = (await db()`
    SELECT id, role, content, created_at, attachments, model FROM messages
    WHERE session_id = ${sessionId} ORDER BY created_at ASC, id ASC
  `) as unknown as (Msg & { attachments: Attachment[] | null })[];

  return (
    <ChatView
      key={sessions[0].id}
      sessionId={sessions[0].id}
      title={sessions[0].title}
      model={sessions[0].model}
      initialMessages={messages.map((m) => ({ ...m, attachments: slimAttachments(m.attachments) }))}
      owner
    />
  );
}
