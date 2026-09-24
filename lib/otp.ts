// language: TypeScript, file: lib/otp.ts, target: kode verifikasi 6 digit (10 menit, 5 percobaan)
import { randomInt } from "node:crypto";
import { db } from "./db";

const TTL_MIN = 10;
const MAX_ATTEMPTS = 5;

/** Buat/ganti kode untuk email. Mengembalikan kode 6 digit. */
export async function createOtp(email: string): Promise<string> {
  const code = String(randomInt(0, 1_000_000)).padStart(6, "0");
  const expires = new Date(Date.now() + TTL_MIN * 60_000).toISOString();
  await db()`
    INSERT INTO email_otps (email, code, attempts, expires_at, created_at)
    VALUES (${email.toLowerCase()}, ${code}, 0, ${expires}, now())
    ON CONFLICT (email) DO UPDATE SET code = EXCLUDED.code, attempts = 0, expires_at = EXCLUDED.expires_at, created_at = now()
  `;
  return code;
}

export type OtpCheck = { ok: boolean; reason?: "missing" | "expired" | "wrong" | "attempts" };

export async function verifyOtp(email: string, code: string): Promise<OtpCheck> {
  const rows = (await db()`
    SELECT code, attempts, expires_at FROM email_otps WHERE email = ${email.toLowerCase()}
  `) as unknown as { code: string; attempts: number; expires_at: string }[];
  const row = rows[0];
  if (!row) return { ok: false, reason: "missing" };
  if (new Date(row.expires_at).getTime() < Date.now()) {
    await db()`DELETE FROM email_otps WHERE email = ${email.toLowerCase()}`;
    return { ok: false, reason: "expired" };
  }
  if (row.attempts + 1 > MAX_ATTEMPTS) {
    await db()`DELETE FROM email_otps WHERE email = ${email.toLowerCase()}`;
    return { ok: false, reason: "attempts" };
  }
  if (row.code !== code) {
    await db()`UPDATE email_otps SET attempts = attempts + 1 WHERE email = ${email.toLowerCase()}`;
    return { ok: false, reason: "wrong" };
  }
  await db()`DELETE FROM email_otps WHERE email = ${email.toLowerCase()}`;
  return { ok: true };
}

/** true kalau kode baru saja dikirim (< 60 dtk) — dipakai untuk menahan resend. */
export async function otpRecentlyCreated(email: string): Promise<boolean> {
  const rows = (await db()`
    SELECT 1 FROM email_otps WHERE email = ${email.toLowerCase()} AND created_at > now() - interval '60 seconds'
  `) as unknown as unknown[];
  return rows.length > 0;
}
