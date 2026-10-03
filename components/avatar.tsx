// language: TypeScript, file: components/avatar.tsx, target: client component
"use client";

import { useState } from "react";

/** Avatar bulat: foto (avatar_url) dengan fallback initial huruf.
 *  Foto gagal dimuat (hotlink block, dsb.) -> otomatis jatuh ke initial. */
export function Avatar({
  url,
  name,
  size = 36,
}: {
  url?: string | null;
  name?: string;
  size?: number;
}) {
  const [err, setErr] = useState(false);
  const initial = ((name || "").trim()[0] || "O").toUpperCase();
  const showImg = Boolean(url) && !err;
  return (
    <span
      className="flex shrink-0 items-center justify-center overflow-hidden rounded-full bg-[color-mix(in_srgb,var(--accent)_26%,var(--border))] font-semibold text-[var(--fg)]"
      style={{ width: size, height: size, fontSize: Math.round(size * 0.4) }}
    >
      {showImg && url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={url}
          alt=""
          className="h-full w-full object-cover"
          onError={() => setErr(true)}
        />
      ) : (
        initial
      )}
    </span>
  );
}
