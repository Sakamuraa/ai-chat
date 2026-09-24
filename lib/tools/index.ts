// language: TypeScript, file: lib/tools/index.ts, target: registri tool untuk /api/chat
import type { ToolCtx, ToolDef, ToolResult } from "./types";
import { WEB_TOOLS } from "./web";
import { FILE_TOOLS } from "./files";
import { EXEC_TOOLS } from "./exec";

export type { ToolResult } from "./types";

const ALL: ToolDef[] = [...WEB_TOOLS, ...FILE_TOOLS, ...EXEC_TOOLS];

/** Daftar tool yang siap dipakai pada runtime ini (dependensi env terpenuhi). */
export function activeTools(): ToolDef[] {
  return ALL.filter((t) => t.enabled());
}

/** Format tool_calls dari model ke bentuk API OpenAI untuk /chat/completions. */
export function toolSchemas(): unknown[] {
  return activeTools().map((t) => ({
    type: "function",
    function: { name: t.name, description: t.description, parameters: t.parameters },
  }));
}

export async function runTool(name: string, argsJson: string, ctx: ToolCtx): Promise<ToolResult> {
  const tool = ALL.find((t) => t.name === name);
  if (!tool) return { ok: false, error: `tool tidak dikenal: ${name}` };
  if (!tool.enabled()) return { ok: false, error: `tool ${name} tidak aktif di server ini` };
  let args: Record<string, unknown> = {};
  try {
    args = argsJson ? (JSON.parse(argsJson) as Record<string, unknown>) : {};
  } catch {
    return { ok: false, error: `argumen bukan JSON valid: ${argsJson.slice(0, 120)}` };
  }
  try {
    return await tool.execute(args, ctx);
  } catch (e) {
    return { ok: false, error: `tool gagal: ${(e as Error).message}` };
  }
}

/** Ringkasan singkat untuk ditampilkan sebagai chip di UI. */
export function toolLabel(name: string, argsJson: string): string {
  let args: Record<string, unknown> = {};
  try {
    args = argsJson ? JSON.parse(argsJson) : {};
  } catch {
    /* biarkan kosong */
  }
  if (name === "web_search") return `mencari: ${String(args.query ?? "").slice(0, 60)}`;
  if (name === "web_extract") return `membaca: ${String(args.url ?? "").slice(0, 60)}`;
  if (name === "create_file") return `membuat: ${String(args.filename ?? "berkas")}`;
  if (name === "run_command") return `menjalankan: ${String(args.command ?? "").slice(0, 60)}`;
  return name;
}
