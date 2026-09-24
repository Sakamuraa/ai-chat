// language: TypeScript, file: app/api/sessions/[id]/route.ts, target: Vercel Node runtime
import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { getSessionUser } from "@/lib/auth";
import { isUuid } from "@/lib/uuid";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string }> };

/** Semua query bawa `AND user_id = ...` — sesi orang lain = 404, bukan 403. */
export async function GET(_req: Request, ctx: Ctx) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { id } = await ctx.params;
  if (!isUuid(id)) return NextResponse.json({ error: "not_found" }, { status: 404 });

  const sessions = (await db()`
    SELECT id, title, model, created_at, updated_at, share_enabled
    FROM sessions WHERE id = ${id} AND user_id = ${user.id}
  `) as unknown as {
    id: string;
    title: string;
    model: string;
    created_at: string;
    updated_at: string;
    share_enabled: boolean;
  }[];
  if (!sessions[0]) return NextResponse.json({ error: "not_found" }, { status: 404 });

  const messages = (await db()`
    SELECT id, role, content, created_at, attachments
    FROM messages WHERE session_id = ${id}
    ORDER BY created_at ASC, id ASC
  `) as unknown as {
    id: string;
    role: "user" | "assistant";
    content: string;
    created_at: string;
    attachments: { name: string; kind: "image" | "text"; mime: string; data: string }[] | null;
  }[];

  return NextResponse.json({ session: sessions[0], messages });
}

const Patch = z.object({
  title: z.string().min(1).max(120).optional(),
  /** nyalakan/matikan tautan bagikan /s/<id> */
  share: z.boolean().optional(),
}).refine((v) => v.title !== undefined || v.share !== undefined, { message: "empty" });

export async function PATCH(req: Request, ctx: Ctx) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { id } = await ctx.params;
  if (!isUuid(id)) return NextResponse.json({ error: "not_found" }, { status: 404 });

  const parsed = Patch.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "invalid_body" }, { status: 400 });

  const rows = (await db()`
    UPDATE sessions SET
      title = COALESCE(${parsed.data.title ?? null}, title),
      share_enabled = COALESCE(${parsed.data.share ?? null}, share_enabled),
      updated_at = now()
    WHERE id = ${id} AND user_id = ${user.id}
    RETURNING id, title, share_enabled
  `) as unknown as { id: string; title: string; share_enabled: boolean }[];
  if (!rows[0]) return NextResponse.json({ error: "not_found" }, { status: 404 });

  return NextResponse.json({ session: rows[0] });
}

export async function DELETE(_req: Request, ctx: Ctx) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { id } = await ctx.params;
  if (!isUuid(id)) return NextResponse.json({ error: "not_found" }, { status: 404 });

  const rows = (await db()`
    DELETE FROM sessions WHERE id = ${id} AND user_id = ${user.id} RETURNING id
  `) as unknown as { id: string }[];
  if (!rows[0]) return NextResponse.json({ error: "not_found" }, { status: 404 });

  return NextResponse.json({ ok: true });
}
