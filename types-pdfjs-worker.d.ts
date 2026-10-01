// pdfjs-dist legacy worker diimpor sebagai modul biasa (mode main-thread,
// lihat lib/attachments.ts) — paket tidak menyediakan tipe untuk path ini.
declare module "pdfjs-dist/legacy/build/pdf.worker.mjs" {
  export const WorkerMessageHandler: unknown;
}
