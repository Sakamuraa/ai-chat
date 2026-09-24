// language: TypeScript, file: lib/attachments.ts, target: klasifikasi lampiran (dipakai client & tes)
export type Attachment = { name: string; kind: "image" | "text"; mime: string; data: string };

export const MAX_MB = 5;

/** Ekstensi teks yang boleh dikirim utuh; sisanya dianggap tidak didukung. */
export const TEXT_EXTS = [
  "md", "txt", "csv", "log", "json", "yaml", "yml", "js", "jsx", "ts", "tsx",
  "py", "go", "rs", "java", "c", "cpp", "h", "sh", "sql", "html", "css",
  "xml", "ini", "env", "toml", "cfg", "conf",
];

export type FileClass = "image" | "text" | "unsupported";

export function classifyFile(name: string, mime: string): FileClass {
  if (mime.startsWith("image/")) return "image";
  if (mime.startsWith("text/")) return "text";
  if (
    ["application/json", "application/xml", "application/yaml", "application/javascript"].includes(mime)
  ) {
    return "text";
  }
  const ext = name.includes(".") ? name.split(".").pop()!.toLowerCase() : "";
  return TEXT_EXTS.includes(ext) ? "text" : "unsupported";
}
