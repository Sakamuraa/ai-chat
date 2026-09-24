// language: TypeScript, file: app/c/[sessionId]/page.tsx, target: Next.js App Router (server component)
import { redirect, notFound } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import { db } from "@/lib/db";
import ChatView, { type Msg } from "@/components/chat-view";
import { slimAttachments, type Attachment } from "@/lib/attachments";

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

  const sessions = (await db()`
    SELECT id, title, model FROM sessions WHERE id = ${sessionId} AND user_id = ${user.id}
  `) as unknown as { id: string; title: string; model: string }[];
  if (!sessions[0]) notFound();

  const messages = (await db()`
    SELECT id, role, content, created_at, attachments FROM messages
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
