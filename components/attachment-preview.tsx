// language: TypeScript, file: components/attachment-preview.tsx, target: preview lampiran + popup (lightbox)
"use client";

import { useEffect, useState } from "react";
import { FileText, Image as ImageIcon, X, Download } from "@phosphor-icons/react";
import type { Attachment } from "@/lib/attachments";
import { useI18n } from "./i18n";

function kindOf(a: Attachment): "image" | "pdf" | "text" | "other" {
  if (a.kind === "image") return "image";
  if (/pdf$/i.test(a.mime) || /\.pdf$/i.test(a.name)) return "pdf";
  if (a.kind === "text") return "text";
  return "other";
}

function extOf(name: string): string {
  const i = name.lastIndexOf(".");
  return i > -1 ? name.slice(i + 1).toUpperCase() : "FILE";
}

/** Isi preview popup sesuai jenis berkas. */
function LightboxBody({ a }: { a: Attachment }) {
  const k = kindOf(a);
  if (k === "image") {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={a.data} alt={a.name} className="max-h-[80vh] max-w-[92vw] rounded-xl object-contain" />;
  }
  if (k === "pdf") {
    return <iframe src={a.data} title={a.name} className="h-[80vh] w-[92vw] rounded-xl border border-[var(--border)] bg-white" />;
  }
  if (k === "text") {
    return (
      <div className="max-h-[80vh] w-[92vw] overflow-auto rounded-xl border border-[var(--border)] bg-[var(--sidebar)] p-4">
        <p className="mb-2 text-xs text-[var(--muted)]">{a.name}</p>
        <pre className="whitespace-pre-wrap break-words font-mono text-[12.5px] leading-relaxed text-[var(--fg)]">
          {a.data}
        </pre>
      </div>
    );
  }
  return (
    <div className="flex w-[92vw] max-w-md flex-col items-center gap-3 rounded-xl border border-[var(--border)] bg-[var(--panel)] p-6">
      <FileText size={34} className="text-[var(--muted)]" />
      <p className="max-w-full break-all text-center text-sm text-[var(--fg)]">{a.name}</p>
      <p className="text-xs text-[var(--muted)]">{extOf(a.name)}</p>
      <a
        href={a.data}
        download={a.name}
        className="flex items-center gap-2 rounded-full bg-[var(--accent)] px-4 py-2 text-sm font-semibold text-[var(--accent-fg)]"
      >
        <Download size={15} /> Unduh
      </a>
    </div>
  );
}

/** Deretan preview untuk satu pesan. Klik gambar/dokumen -> popup besar di layar. */
export default function AttachmentPreview({
  attachments,
  compact = false,
}: {
  attachments: Attachment[];
  compact?: boolean;
}) {
  const { t } = useI18n();
  const [open, setOpen] = useState<Attachment | null>(null);

  // Esc menutup popup pratinjau (tanpa ini, overlay bisa menyangkut)
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(null);
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  if (!attachments || attachments.length === 0) return null;

  return (
    <>
      <div className={`flex flex-wrap gap-2 ${compact ? "mb-1.5" : "mb-2"}`}>
        {attachments.map((a, i) => {
          const k = kindOf(a);
          if (k === "image") {
            return (
              <button
                key={`${a.name}-${i}`}
                onClick={() => setOpen(a)}
                title={a.name}
                aria-label={a.name}
                className="group relative h-16 w-16 overflow-hidden rounded-lg border border-[var(--border)] bg-[var(--sidebar)] transition hover:border-[var(--border-strong)]"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={a.data} alt={a.name} className="h-full w-full object-cover" />
              </button>
            );
          }
          return (
            <button
              key={`${a.name}-${i}`}
              onClick={() => setOpen(a)}
              aria-label={a.name}
              className="flex max-w-[240px] items-center gap-2 rounded-lg border border-[var(--border)] bg-[var(--sidebar)] px-2.5 py-2 text-left transition hover:border-[var(--border-strong)]"
            >
              {k === "pdf" || k === "other" ? (
                <FileText size={16} className="shrink-0 text-[var(--muted)]" />
              ) : (
                <ImageIcon size={16} className="shrink-0 text-[var(--muted)]" />
              )}
              <span className="min-w-0">
                <span className="block truncate text-xs font-medium text-[var(--fg)]">{a.name}</span>
                <span className="block text-[10px] uppercase text-[var(--faint)]">{extOf(a.name)}</span>
              </span>
            </button>
          );
        })}
      </div>

      {open ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4"
          role="dialog"
          aria-modal="true"
          aria-label={t("preview.close")}
          onClick={() => setOpen(null)}
        >
          <button
            onClick={() => setOpen(null)}
            aria-label={t("preview.close")}
            className="absolute right-4 top-4 rounded-full border border-white/25 bg-black/40 p-2 text-white transition hover:bg-black/70"
          >
            <X size={18} />
          </button>
          <div onClick={(e) => e.stopPropagation()}>
            <LightboxBody a={open} />
          </div>
        </div>
      ) : null}
    </>
  );
}
