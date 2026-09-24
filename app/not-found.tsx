// language: TypeScript, file: app/not-found.tsx, target: Next.js App Router
import Link from "next/link";

export default function NotFound() {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-3 p-8 text-center">
      <span className="inline-block h-8 w-8 rounded-md bg-[#facc15]" />
      <h1 className="text-xl font-semibold">Sesi tidak ditemukan</h1>
      <p className="max-w-sm text-sm text-[var(--muted)]">
        Sesi ini bukan milikmu, sudah dihapus, atau tautannya salah.
      </p>
      <Link
        href="/"
        className="mt-2 rounded-lg bg-[#facc15] px-4 py-2 text-sm font-semibold text-black"
      >
        Chat baru
      </Link>
    </div>
  );
}
