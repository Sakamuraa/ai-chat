// language: TypeScript, file: components/markdown.tsx, target: client component (kutipan + ikon sumber)
"use client";

import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeHighlight from "rehype-highlight";

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
        }}
      >
        {children}
      </ReactMarkdown>
    </div>
  );
}
