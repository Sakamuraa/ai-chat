// language: TypeScript, file: lib/auth.ts, target: Vercel Node runtime (scrypt butuh node:crypto)
import { scryptSync, randomBytes, randomUUID, timingSafeEqual, createHash } from "node:crypto";
import { cookies } from "next/headers";
import type { NextResponse } from "next/server";
import { db } from "./db";

export const SESSION_COOKIE = "ai_sid";
const SESSION_DAYS = 30;

export type SessionUser = { id: string; username: string; is_admin: boolean };

export function hashPassword(plain: string): string {
  const salt = randomBytes(16).toString("hex");
  return `${salt}:${scryptSync(plain, salt, 64).toString("hex")}`;
}

export function verifyPassword(plain: string, stored: string): boolean {
  const [salt, hex] = stored.split(":");
  if (!salt || !hex) return false;
  const a = scryptSync(plain, salt, 64);
  const b = Buffer.from(hex, "hex");
  return a.length === b.length && timingSafeEqual(a, b);
}

export const sha256 = (s: string): string => createHash("sha256").update(s).digest("hex");

/** Insert token sesi, kembalikan nilai mentah (yang dikirim ke cookie). */
export async function createSessionToken(userId: string): Promise<string> {
  const raw = randomBytes(32).toString("hex");
  const expires = new Date(Date.now() + SESSION_DAYS * 86_400_000).toISOString();
  await db()`
    INSERT INTO auth_tokens (token_hash, user_id, expires_at)
    VALUES (${sha256(raw)}, ${userId}, ${expires})
  `;
  return raw;
}

export async function destroySessionToken(raw: string): Promise<void> {
  await db()`DELETE FROM auth_tokens WHERE token_hash = ${sha256(raw)}`;
}

/** Validasi cookie -> user. null kalau tidak ada / kedaluwarsa / user hilang. */
export async function getSessionUser(): Promise<SessionUser | null> {
  const store = await cookies();
  const raw = store.get(SESSION_COOKIE)?.value;
  if (!raw) return null;
  const rows = (await db()`
    SELECT u.id, u.username, u.is_admin
    FROM auth_tokens t
    JOIN users u ON u.id = t.user_id
    WHERE t.token_hash = ${sha256(raw)} AND t.expires_at > now()
  `) as unknown as SessionUser[];
  return rows[0] ?? null;
}

export function sessionCookieOptions() {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/",
    maxAge: SESSION_DAYS * 86_400,
  };
}

/**
 * Cookie penanda perangkat untuk daftar akun switch-account (permintaan Manuel, 2026-09-26).
 * httpOnly: JS tidak perlu membacanya, server saja yang pakai.
 */
export const ACCOUNT_HANDLE_COOKIE = "ai_handle";
const HANDLE_DAYS = 30;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function handleCookieOptions() {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/",
    maxAge: HANDLE_DAYS * 86_400,
  };
}

/**
 * Terbitkan cookie sesi dan rekam SEMUA akun yang pernah login di peramban ini.
 * Dipanggil dari tiap jalur login (sandi, OTP, OAuth) supaya akun sebelumnya yang
 * tertimpa cookie tetap tercatat di account_slots dan bisa dipilih lewat Ganti akun.
 * Token sesi lama TIDAK disimpan; pindah akun membuat token baru.
 */
export async function issueSessionCookie(
  res: NextResponse,
  token: string,
  userId: string,
): Promise<void> {
  const store = await cookies();
  const oldRaw = store.get(SESSION_COOKIE)?.value ?? "";
  let handle = store.get(ACCOUNT_HANDLE_COOKIE)?.value ?? "";
  if (!UUID_RE.test(handle)) handle = randomUUID();

  const wanted = new Set<string>([userId]);
  if (oldRaw && oldRaw !== token) {
    const rows = (await db()`
      SELECT user_id FROM auth_tokens
      WHERE token_hash = ${sha256(oldRaw)} AND expires_at > now()
    `) as unknown as { user_id: string }[];
    if (rows[0]?.user_id) wanted.add(rows[0].user_id);
  }

  for (const uid of wanted) {
    await db()`
      INSERT INTO account_slots (handle, user_id) VALUES (${handle}, ${uid})
      ON CONFLICT (handle, user_id) DO UPDATE SET last_used = now()
    `;
  }

  res.cookies.set(SESSION_COOKIE, token, sessionCookieOptions());
  res.cookies.set(ACCOUNT_HANDLE_COOKIE, handle, handleCookieOptions());
}
