// language: TypeScript, file: lib/tools/types.ts, target: tipe dasar tool
export type ToolArg = Record<string, unknown>;

export type ToolResult =
  | { ok: true; text: string; fileUrl?: string; fileName?: string }
  | { ok: false; error: string };

export type ToolCtx = { userId: string };

export type ToolDef = {
  name: string;
  description: string;
  /** JSON Schema untuk argumen */
  parameters: Record<string, unknown>;
  /** true = tampil ke model (dependensi env terpenuhi) */
  enabled: () => boolean;
  execute: (args: ToolArg, ctx: ToolCtx) => Promise<ToolResult>;
};
