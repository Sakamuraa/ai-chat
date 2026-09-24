// language: TypeScript, file: app/api/models/route.ts, target: Vercel Node runtime
import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { listModels, FALLBACK_MODELS } from "@/lib/gateway";

export const runtime = "nodejs";

export async function GET() {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  try {
    const models = await listModels();
    if (models.length > 0) return NextResponse.json({ models, source: "gateway" });
  } catch {
    /* gateway tidak terjangkau → fallback statis, jangan error */
  }
  return NextResponse.json({ models: FALLBACK_MODELS, source: "fallback" });
}
