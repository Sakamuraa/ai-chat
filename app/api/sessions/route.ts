// language: TypeScript, file: app/api/sessions/route.ts, target: Vercel Node runtime
import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { getSessionUser } from "@/lib/auth";

export const runtime = "nodejs";

export type SessionRow = {
  id: string;
  title: string;
  model: string;
  created_at: string;
  updated_at: string;
  share_enabled: boolean;
  preview: string | null;
};

export async function GET() {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  // preview = pesan user pertama; dipakai sidebar saat judul masih 'New chat'
  const rows = (await db()`
    SELECT s.id, s.title, s.model, s.created_at, s.updated_at, s.share_enabled,
      (SELECT left(m.content, 90) FROM messages m
        WHERE m.session_id = s.id AND m.role = 'user'
        ORDER BY m.created_at ASC, m.id ASC LIMIT 1) AS preview
    FROM sessions s
    WHERE s.user_id = ${user.id}
    ORDER BY s.updated_at DESC
    LIMIT 200
  `) as unknown as SessionRow[];

  return NextResponse.json({ sessions: rows });
}

const Create = z.object({ model: z.string().min(1).max(120) });

export async function POST(req: Request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const parsed = Create.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "invalid_body" }, { status: 400 });

  const rows = (await db()`
    INSERT INTO sessions (user_id, model) VALUES (${user.id}, ${parsed.data.model})
    RETURNING id, title, model, created_at, updated_at, NULL::text AS preview
  `) as unknown as SessionRow[];

  return NextResponse.json({ session: rows[0] }, { status: 201 });
}
