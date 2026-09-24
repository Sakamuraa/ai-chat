// language: TypeScript, file: lib/tools/exec.ts, target: eksekusi perintah di container lewat sidecar bertoken
import type { ToolDef, ToolResult } from "./types";

const BASE = () => process.env.EXEC_BASE ?? "";
const KEY = () => process.env.EXEC_KEY ?? "";

const SAFE = /^[\s\S]{1,4000}$/;

const exec: ToolDef = {
  name: "run_command",
  description:
    "Jalankan perintah shell di mesin kerja (Linux) untuk tugas nyata: memproses file, menghitung, menjalankan skrip, memeriksa isi direktori kerja. Mengembalikan stdout, stderr, dan kode keluar. Pakai hanya bila user meminta pekerjaan terminal.",
  parameters: {
    type: "object",
    properties: {
      command: { type: "string", description: "Perintah bash yang akan dijalankan" },
      timeout_seconds: { type: "integer", minimum: 1, maximum: 60, description: "Batas waktu, default 30" },
    },
    required: ["command"],
  },
  enabled: () => Boolean(BASE() && KEY()),
  execute: async (args): Promise<ToolResult> => {
    const command = String(args.command ?? "").trim();
    if (!command || !SAFE.test(command)) return { ok: false, error: "perintah tidak valid" };
    const timeout = Math.min(60, Math.max(1, Number(args.timeout_seconds) || 30));
    try {
      const res = await fetch(`${BASE()}/exec`, {
        method: "POST",
        headers: { "content-type": "application/json", "x-exec-key": KEY() },
        body: JSON.stringify({ command, timeout }),
        signal: AbortSignal.timeout((timeout + 10) * 1000),
      });
      const data = (await res.json().catch(() => ({}))) as {
        stdout?: string; stderr?: string; exit_code?: number; error?: string;
      };
      if (!res.ok) return { ok: false, error: data.error ?? `sidecar ${res.status}` };
      const parts = [
        `exit code: ${data.exit_code}`,
        data.stdout ? `\nstdout:\n${data.stdout.slice(0, 8000)}` : "",
        data.stderr ? `\nstderr:\n${data.stderr.slice(0, 4000)}` : "",
      ].join("");
      return { ok: true, text: parts.trim() };
    } catch (e) {
      return { ok: false, error: `sidecar tak terjangkau: ${(e as Error).message}` };
    }
  },
};

export const EXEC_TOOLS: ToolDef[] = [exec];
