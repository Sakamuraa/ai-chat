// language: JavaScript (ESM), file: scripts/create_test_account.mjs, target: Neon
// Buat akun uji permanen. Hash persis seperti lib/auth.ts: `<salt>:<scrypt(salt,64).hex>`.
// Pakai: node scripts/create_test_account.mjs <username> <password>
import { neon } from "@neondatabase/serverless";
import { readFileSync } from "node:fs";
import { randomBytes, scryptSync } from "node:crypto";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const [, , username, password] = process.argv;
if (!username || !password || password.length < 8) {
  console.error("pakai: node scripts/create_test_account.mjs <username> <password min 8>");
  process.exit(1);
}

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const line = readFileSync(resolve(root, ".env.vercel"), "utf8")
  .split("\n")
  .find((l) => l.startsWith("DATABASE_URL="));
const sql = neon(line.slice("DATABASE_URL=".length).trim());

const salt = randomBytes(16).toString("hex");
const hash = `${salt}:${scryptSync(password, salt, 64).toString("hex")}`;

const rows = await sql`
  INSERT INTO users (username, pass_hash, is_admin, language)
  SELECT ${username}, ${hash}, NOT EXISTS (SELECT 1 FROM users), 'id'
  ON CONFLICT (username) DO NOTHING
  RETURNING id, username, is_admin
`;

const check = await sql`SELECT username, is_admin FROM users WHERE username = ${username}`;

// verifikasi ulang format hash cocok dengan verifyPassword()
const [s2, h2] = (await sql`SELECT pass_hash FROM users WHERE username = ${username}`)[0].pass_hash.split(":");
const ok = scryptSync(password, s2, 64).toString("hex") === h2;

console.log(
  JSON.stringify(
    {
      dibuat: rows.length === 1,
      ada: check.length === 1,
      username: check[0]?.username,
      is_admin: check[0]?.is_admin,
      hash_valid: ok,
    },
    null,
    1,
  ),
);
