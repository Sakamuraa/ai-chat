// language: TypeScript, file: app/api/sessions/route.ts, target: Vercel Node runtime
import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { getSessionUser } from "@/lib/auth";

export const runtime = "nodejs";

export async function GET() {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const rows = (await db()`
    SELECT id, title, model, created_at, updated_at
    FROM sessions WHERE user_id = ${user.id}
    ORDER BY updated_at DESC
    LIMIT 200
  `) as unknown as { id: string; title: string; model: string; created_at: string; updated_at: string }[];

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
    RETURNING id, title, model, created_at, updated_at
  `) as unknown as { id: string; title: string; model: string }[];

  return NextResponse.json({ session: rows[0] }, { status: 201 });
}
