// language: TypeScript, file: app/api/subscriptions/codes/route.ts, target: kelola kode (hanya admin)
import { NextResponse } from "next/server";
import { z } from "zod";
import { getSessionUser } from "@/lib/auth";
import { createCode, listCodes, TOKEN_OPTIONS, DURATION_OPTIONS } from "@/lib/subscriptions";
import { PLANS } from "@/lib/plans";

export const runtime = "nodejs";

async function requireAdmin() {
  const user = await getSessionUser();
  if (!user) return { error: NextResponse.json({ error: "unauthorized" }, { status: 401 }) };
  if (!user.is_admin) return { error: NextResponse.json({ error: "forbidden" }, { status: 403 }) };
  return { user };
}

/** Daftar opsi agar UI dan server sepakat soal nilai yang sah. */
export async function GET() {
  const gate = await requireAdmin();
  if (gate.error) return gate.error;
  const codes = await listCodes();
  return NextResponse.json({
    codes,
    tokenOptions: TOKEN_OPTIONS,
    durationOptions: DURATION_OPTIONS,
    plans: PLANS,
  });
}

const Create = z.object({
  tokenLimit: z.union([z.number().int().positive(), z.null()]),
  durationHours: z.number().int().positive().max(8760 * 2),
  plan: z.enum(["free", "pro", "max"]).default("free"),
});

export async function POST(req: Request) {
  const gate = await requireAdmin();
  if (gate.error) return gate.error;

  const parsed = Create.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "invalid_body" }, { status: 400 });

  const { tokenLimit, durationHours, plan } = parsed.data;
  const sahToken = TOKEN_OPTIONS.some((o) => o.value === tokenLimit);
  const sahDurasi = DURATION_OPTIONS.some((o) => o.hours === durationHours);
  if (!sahToken || !sahDurasi) {
    return NextResponse.json({ error: "invalid_option" }, { status: 400 });
  }

  const code = await createCode(gate.user.id, tokenLimit, durationHours, plan);
  return NextResponse.json({ code }, { status: 201 });
}
