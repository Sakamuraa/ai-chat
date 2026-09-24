// language: JavaScript (ESM), file: scripts/migrate.mjs, target: Neon Postgres
// Jalankan db/schema.sql (idempoten) + semua db/migrations/*.sql berurutan, lalu cetak struktur.
import { neon } from "@neondatabase/serverless";
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");

const line = readFileSync(resolve(root, ".env.vercel"), "utf8")
  .split("\n")
  .find((l) => l.startsWith("DATABASE_URL="));
if (!line) {
  console.error("DATABASE_URL tidak ada di .env.vercel");
  process.exit(1);
}
const sql = neon(line.slice("DATABASE_URL=".length).trim());

const files = [resolve(root, "db/schema.sql")];
const migDir = resolve(root, "db/migrations");
if (existsSync(migDir)) {
  files.push(...readdirSync(migDir).filter((f) => f.endsWith(".sql")).sort().map((f) => resolve(migDir, f)));
}

for (const file of files) {
  const text = readFileSync(file, "utf8")
    .split("\n")
    .filter((l) => !l.trim().startsWith("--"))
    .join("\n");
  const stmts = text.split(";").map((s) => s.trim()).filter(Boolean);
  for (const stmt of stmts) {
    await sql.query(stmt);
  }
  console.log(`ok ${file.replace(root + "/", "")} (${stmts.length} statement)`);
}

const cols = await sql`
  SELECT table_name, string_agg(column_name, ', ' ORDER BY ordinal_position) AS c
  FROM information_schema.columns WHERE table_schema='public'
  GROUP BY table_name ORDER BY table_name
`;
for (const r of cols) console.log(`${r.table_name}: ${r.c}`);
