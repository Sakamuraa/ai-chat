// language: TypeScript, file: app/s/[sessionId]/page.tsx, target: Next.js App Router — tautan bagikan (publik, hanya-baca)
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import ShareView from "@/components/share-view";
import type { Msg } from "@/components/chat-view";
import { isUuid } from "@/lib/uuid";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export default async function SharePage({ params }: { params: Promise<{ sessionId: string }> }) {
  const { sessionId } = await params;
  // bukan uuid (mis. /s/new) -> 404, jangan biarkan Postgres melempar 22P02 -> 500
  if (!isUuid(sessionId)) notFound();

  // hanya sesi yang sengaja dibagikan oleh pemiliknya yang tampil
  const sessions = (await db()`
    SELECT id, title, model, share_enabled
    FROM sessions WHERE id = ${sessionId} AND share_enabled = true
  `) as unknown as { id: string; title: string; model: string }[];
  if (!sessions[0]) notFound();

  const messages = (await db()`
    SELECT id, role, content, attachments
    FROM messages WHERE session_id = ${sessionId}
    ORDER BY created_at ASC, id ASC
  `) as unknown as {
    id: string;
    role: Msg["role"];
    content: string;
    attachments: { name: string; kind: "image" | "text"; mime: string; data: string }[] | null;
  }[];

  return (
    <ShareView
      sessionId={sessions[0].id}
      title={sessions[0].title}
      model={sessions[0].model}
      initialMessages={messages.map((m) => ({
        id: m.id,
        role: m.role,
        content: m.content,
        attachments: m.attachments ?? [],
      }))}
    />
  );
}
