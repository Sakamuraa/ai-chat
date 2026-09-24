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


/** Parse argumen tool secara longgar: buang koma ekor, kutip kutip-tunggal, teks yang terpotong.
 *  Gagal -> null (pesan singkat; jangan bocorkan potongan argumen ke model supaya tak dikutip). */
function parseArgs(raw: string): Record<string, unknown> | null {
  if (!raw || !raw.trim()) return {};
  const s = raw.trim();
  const attempts = [
    s,
    s.replace(/,\s*([}\]])/g, "$1"),                 // koma ekor
    s.replace(/[\u201c\u201d]/g, '"').replace(/[\u2018\u2019]/g, "'"), // kutip aneh
    s.replace(/\n/g, "\n"),                          // kontrol liar
    s.replace(/,\s*([}\]])/g, "$1").replace(/[\u201c\u201d]/g, '"'),
  ];
  for (const a of attempts) {
    try {
      const v = JSON.parse(a) as unknown;
      if (v && typeof v === "object" && !Array.isArray(v)) return v as Record<string, unknown>;
    } catch {
      /* coba pola berikutnya */
    }
  }
  return null;
}

export async function runTool(name: string, argsJson: string, ctx: ToolCtx): Promise<ToolResult> {
  const tool = ALL.find((t) => t.name === name);
  if (!tool) return { ok: false, error: `tool tidak dikenal: ${name}` };
  if (!tool.enabled()) return { ok: false, error: `tool ${name} tidak aktif di server ini` };
  const args = parseArgs(argsJson);
  if (!args) return { ok: false, error: "argumen tool tidak valid" };
  try {
    return await tool.execute(args, ctx);
  } catch (e) {
    return { ok: false, error: `tool gagal: ${(e as Error).message}` };
  }
}

/** Ringkasan singkat untuk ditampilkan sebagai chip di UI. */
export function toolLabel(name: string, argsJson: string): string {
  const args = parseArgs(argsJson) ?? {};
  if (name === "web_search") return `mencari: ${String(args.query ?? "").slice(0, 60)}`;
  if (name === "web_extract") return `membaca: ${String(args.url ?? "").slice(0, 60)}`;
  if (name === "create_file") return `membuat: ${String(args.filename ?? "berkas")}`;
  if (name === "run_command") return `menjalankan: ${String(args.command ?? "").slice(0, 60)}`;
  return name;
}
