// language: JavaScript (ESM), file: scripts/cleanup-e2e.mjs, target: Neon
// Hapus baris uji end-to-end (users + cascade sesi & pesan). Idempoten.
import { neon } from "@neondatabase/serverless";
import { readFileSync } from "node:fs";
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

const removed = await sql`
  DELETE FROM users WHERE username IN ('e2e_alice', 'e2e_bob') RETURNING username
`;
console.log("user dihapus:", removed.map((r) => r.username).join(", ") || "(tidak ada)");

const counts = await sql`
  SELECT (SELECT count(*)::int FROM users)   AS users,
         (SELECT count(*)::int FROM sessions) AS sessions,
         (SELECT count(*)::int FROM messages) AS messages
`;
console.log("sisa baris:", JSON.stringify(counts[0]));
