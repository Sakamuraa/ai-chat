// language: JavaScript (ESM), file: scripts/apply-schema.mjs, target: Neon Postgres via HTTP driver
// Jalankan db/schema.sql (idempoten) lalu laporkan tabel yang benar-benar ada.
// DATABASE_URL diambil dari argumen pertama, env DATABASE_URL, atau .env.vercel.
import { neon } from "@neondatabase/serverless";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "..");

function readEnvUrl() {
  if (process.argv[2]) return process.argv[2];
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL;
  try {
    const txt = readFileSync(resolve(root, ".env.vercel"), "utf8");
    const line = txt.split("\n").find((l) => l.startsWith("DATABASE_URL="));
    if (line && !line.includes("ISI_DARI")) return line.slice("DATABASE_URL=".length).trim();
  } catch {}
  return null;
}

const url = readEnvUrl();
if (!url) {
  console.error("DATABASE_URL tidak ditemukan");
  process.exit(1);
}
if (!url.startsWith("postgres")) {
  console.error("DATABASE_URL bukan connection string postgres");
  process.exit(1);
}

const sql = neon(url);

// schema.sql sengaja bebas blok dollar-quote, jadi split per titik koma aman
const schema = readFileSync(resolve(root, "db/schema.sql"), "utf8")
  .split("\n")
  .filter((l) => !l.trim().startsWith("--"))
  .join("\n");

const statements = schema
  .split(";")
  .map((s) => s.trim())
  .filter(Boolean);

console.log(`menjalankan ${statements.length} statement`);
for (const [i, stmt] of statements.entries()) {
  try {
    await sql.query(stmt);
    console.log(`  ok ${i + 1}/${statements.length}: ${stmt.split("\n")[0].slice(0, 60)}`);
  } catch (e) {
    console.error(`  GAGAL ${i + 1}: ${stmt.slice(0, 120)}\n  ${e.message}`);
    process.exit(1);
  }
}

const rows = await sql`
  SELECT table_name FROM information_schema.tables
  WHERE table_schema = 'public' ORDER BY table_name
`;
const cols = await sql`
  SELECT table_name, count(*)::int AS n
  FROM information_schema.columns
  WHERE table_schema = 'public' GROUP BY table_name ORDER BY table_name
`;
console.log("tabel:", rows.map((r) => r.table_name).join(", "));
console.log("jumlah kolom:", cols.map((c) => `${c.table_name}=${c.n}`).join(" "));
console.log("index:", (await sql`
  SELECT indexname FROM pg_indexes WHERE schemaname='public' ORDER BY indexname
`).map((r) => r.indexname).join(", "));
