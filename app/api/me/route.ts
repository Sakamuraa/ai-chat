// language: TypeScript, file: app/api/me/route.ts, target: Vercel Node runtime
import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { getSessionUser } from "@/lib/auth";

export const runtime = "nodejs";

export type Me = {
  id: string;
  username: string;
  avatar_url: string | null;
  personality: string | null;
  memory_enabled: boolean;
  language: string;
};

const Patch = z.object({
  username: z.string().min(3).max(32).regex(/^[a-zA-Z0-9_.-]+$/).optional(),
  avatar_url: z.string().max(400).nullable().optional(),
  personality: z.string().max(2000).nullable().optional(),
  memory_enabled: z.boolean().optional(),
  language: z.enum(["id", "en"]).optional(),
});

export async function GET() {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const rows = (await db()`
    SELECT id, username, avatar_url, personality, memory_enabled, language
    FROM users WHERE id = ${user.id}
  `) as unknown as Me[];
  if (!rows[0]) return NextResponse.json({ error: "not_found" }, { status: 404 });
  return NextResponse.json({ user: rows[0] });
}

export async function PATCH(req: Request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const parsed = Patch.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: "invalid_body", detail: parsed.error.issues[0]?.message ?? "Data tidak valid" },
      { status: 400 },
    );
  }
  const p = parsed.data;
  if (Object.keys(p).length === 0) return NextResponse.json({ error: "empty" }, { status: 400 });

  try {
    const rows = (await db()`
      UPDATE users SET
        username    = COALESCE(${p.username ?? null}, username),
        avatar_url  = CASE WHEN ${p.avatar_url === undefined} THEN avatar_url ELSE ${p.avatar_url ?? null} END,
        personality = CASE WHEN ${p.personality === undefined} THEN personality ELSE ${p.personality ?? null} END,
        memory_enabled = COALESCE(${p.memory_enabled ?? null}, memory_enabled),
        language    = COALESCE(${p.language ?? null}, language)
      WHERE id = ${user.id}
      RETURNING id, username, avatar_url, personality, memory_enabled, language
    `) as unknown as Me[];
    return NextResponse.json({ user: rows[0] });
  } catch (e) {
    if ((e as { code?: string }).code === "23505") {
      return NextResponse.json({ error: "username_taken" }, { status: 409 });
    }
    throw e;
  }
}
