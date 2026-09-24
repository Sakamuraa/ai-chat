// language: TypeScript, file: lib/uuid.ts, target: penjaga UUID (cegah 500 karena cast Postgres gagal)
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Tanpa penjaga ini, path seperti /s/new atau /api/sessions/new ikut masuk query
 * `WHERE id = $1` bertipe uuid -> Postgres melempar 22P02 dan jadi 500.
 * Semua id dari URL dicek dulu; bukan uuid -> perlakukan seperti tidak ditemukan (404).
 */
export function isUuid(v: string): boolean {
  return UUID_RE.test(v);
}
