// language: TypeScript, file: components/markdown.tsx, target: client component (kutipan, ikon sumber, lightbox gambar)
"use client";

import { useEffect, useState, type ReactNode } from "react";
import { Copy } from "@phosphor-icons/react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeHighlight from "rehype-highlight";
import { useI18n } from "./i18n";

/** Gambar inline — klik untuk preview penuh (lightbox), Esc/klik luar untuk menutup. */
function PreviewableImage({ src, alt }: { src: string; alt: string }) {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <>
      <img
        src={src}
        alt={alt}
        loading="lazy"
        onClick={() => setOpen(true)}
        className="my-2 max-h-96 w-auto max-w-full cursor-zoom-in rounded-xl border border-[var(--border)]"
      />
      {open ? (
        <div
          role="dialog"
          aria-modal="true"
          onClick={() => setOpen(false)}
          className="fixed inset-0 z-[120] flex cursor-zoom-out items-center justify-center bg-black/85 p-6"
        >
          <img
            src={src}
            alt={alt}
            className="max-h-full max-w-full rounded-xl object-contain shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          />
          <button
            type="button"
            aria-label="Tutup"
            onClick={() => setOpen(false)}
            className="absolute right-5 top-4 flex h-9 w-9 items-center justify-center rounded-full border border-white/30 text-lg text-white/80 transition hover:bg-white/10"
          >
            ✕
          </button>
        </div>
      ) : null}
    </>
  );
}

/** Ikon tautan kecil di kanan kalimat kutipan — ala ChatGPT/Claude. */
function LinkIcon() {
  return (
    <svg
      aria-hidden
      viewBox="0 0 12 12"
      className="ml-0.5 inline-block h-[9px] w-[9px] -translate-y-[3px] align-baseline opacity-55"
    >
      <path
        d="M4.5 2h5.5v5.5M10 2 5 7M9 8.5V10H2V3h1.5"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/** teks murni dari node React (utk tombol salin kode) */
function nodeText(n: unknown): string {
  if (n === null || n === undefined || typeof n === "boolean") return "";
  if (typeof n === "string" || typeof n === "number") return String(n);
  if (Array.isArray(n)) return n.map(nodeText).join("");
  const el = n as { props?: { children?: unknown } };
  if (el && typeof el === "object" && "props" in el) return nodeText(el.props?.children);
  return "";
}

/** Blok kode (``` … ```) dgn tombol salin di kanan atas — ala Claude/ChatGPT. */
function CodeBlock({ children }: { children?: ReactNode }) {
  const { t } = useI18n();
  const [copied, setCopied] = useState(false);
  return (
    <div className="group relative">
      <button
        type="button"
        onClick={() => {
          void navigator.clipboard.writeText(nodeText(children));
          setCopied(true);
          setTimeout(() => setCopied(false), 1600);
        }}
        className="absolute right-2 top-2 z-10 flex items-center gap-1 rounded-md border border-[var(--border)] bg-[var(--panel)] px-2 py-1 text-[11px] text-[var(--muted)] opacity-0 shadow-sm transition group-hover:opacity-100 focus:opacity-100 hover:text-[var(--fg)]"
      >
        <Copy size={12} /> {copied ? t("chat.copied") : t("chat.copy")}
      </button>
      <pre>{children}</pre>
    </div>
  );
}

export default function Markdown({ children }: { children: string }) {
  return (
    <div className="md">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[rehypeHighlight]}
        components={{
          a: ({ href, children: teks }) => (
            <a
              href={href}
              target="_blank"
              rel="noopener noreferrer"
              className="text-[var(--fg)] underline decoration-[color-mix(in_srgb,var(--accent)_70%,transparent)] decoration-1 underline-offset-2 transition hover:decoration-[var(--accent)]"
            >
              {teks}
              <LinkIcon />
            </a>
          ),
          img: ({ src, alt }) => (
            <PreviewableImage src={typeof src === "string" ? src : ""} alt={typeof alt === "string" ? alt : ""} />
          ),
          pre: ({ children: isi }) => <CodeBlock>{isi}</CodeBlock>,
        }}
      >
        {children}
      </ReactMarkdown>
    </div>
  );
}
