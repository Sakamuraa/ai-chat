// language: TypeScript, file: lib/oauth.ts, target: alur OAuth Google/Discord tanpa dependensi tambahan
import { randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { db } from "./db";
import { createSessionToken, hashPassword, issueSessionCookie } from "./auth";

export type Provider = "google" | "discord";

const STATE_COOKIE = "oauth_state";

export function oauthConfigured(p: Provider): boolean {
  return p === "google"
    ? Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET)
    : Boolean(process.env.DISCORD_CLIENT_ID && process.env.DISCORD_CLIENT_SECRET);
}

function callbackUrl(p: Provider, origin: string): string {
  const host = process.env.AUTH_CALLBACK_ORIGIN || origin;
  return `${host.replace(/\/$/, "")}/api/auth/${p}/callback`;
}

/** Halaman persetujuan penyedia. */
export async function startOAuth(p: Provider, origin: string): Promise<NextResponse> {
  if (!oauthConfigured(p)) {
    return NextResponse.json({ error: "provider_not_configured" }, { status: 503 });
  }
  const state = randomBytes(16).toString("hex");
  const res = NextResponse.redirect(
    p === "google"
      ? new URL(
          "https://accounts.google.com/o/oauth2/v2/auth?" +
            new URLSearchParams({
              client_id: process.env.GOOGLE_CLIENT_ID!,
              redirect_uri: callbackUrl(p, origin),
              response_type: "code",
              scope: "openid email profile",
              prompt: "select_account",
              state,
            }).toString(),
        )
      : new URL(
          "https://discord.com/api/oauth2/authorize?" +
            new URLSearchParams({
              client_id: process.env.DISCORD_CLIENT_ID!,
              redirect_uri: callbackUrl(p, origin),
              response_type: "code",
              scope: "identify email",
              state,
            }).toString(),
        ),
    302,
  );
  res.cookies.set(STATE_COOKIE, state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/api/auth",
    maxAge: 600,
  });
  return res;
}

type Profile = { id: string; email: string | null; name: string | null; picture: string | null };

async function exchange(p: Provider, code: string, origin: string): Promise<Profile> {
  const body =
    p === "google"
      ? new URLSearchParams({
          code,
          client_id: process.env.GOOGLE_CLIENT_ID!,
          client_secret: process.env.GOOGLE_CLIENT_SECRET!,
          redirect_uri: callbackUrl(p, origin),
          grant_type: "authorization_code",
        })
      : new URLSearchParams({
          grant_type: "authorization_code",
          code,
          redirect_uri: callbackUrl(p, origin),
          client_id: process.env.DISCORD_CLIENT_ID!,
          client_secret: process.env.DISCORD_CLIENT_SECRET!,
        });

  const tokRes = await fetch(p === "google" ? "https://oauth2.googleapis.com/token" : "https://discord.com/api/oauth2/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body,
  });
  if (!tokRes.ok) throw new Error(`tukar kode gagal (${p}: ${tokRes.status})`);
  const tok = (await tokRes.json()) as { access_token: string };

  const infoRes = await fetch(
    p === "google" ? "https://openidconnect.googleapis.com/v1/userinfo" : "https://discord.com/api/users/@me",
    { headers: { authorization: `Bearer ${tok.access_token}` } },
  );
  if (!infoRes.ok) throw new Error(`info profil gagal (${p}: ${infoRes.status})`);
  const info = (await infoRes.json()) as {
    sub?: string;
    id?: string;
    email?: string;
    name?: string;
    global_name?: string;
    username?: string;
    picture?: string;
    avatar?: string;
  };

  const id = String(info.sub ?? info.id ?? "");
  const email = info.email ?? null;
  const name = info.name ?? info.global_name ?? info.username ?? null;
  let picture = info.picture ?? null;
  if (p === "discord" && info.avatar) {
    picture = `https://cdn.discordapp.com/avatars/${id}/${info.avatar}.png?size=256`;
  }
  if (!id) throw new Error("penyedia tidak mengirim id pengguna");
  return { id, email, name, picture };
}

function slugify(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9_.-]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 24);
}

async function uniqueUsername(base: string): Promise<string> {
  const root = slugify(base) || "user";
  for (let i = 0; i < 40; i++) {
    const cand = i === 0 ? root : `${root}${randomBytes(2).toString("hex").slice(0, 3)}`;
    const rows = (await db()`SELECT 1 FROM users WHERE username = ${cand}`) as unknown as unknown[];
    if (rows.length === 0) return cand;
  }
  return `${root}_${randomBytes(3).toString("hex")}`;
}

/** Cari/buat akun dari profil penyedia. nickname & avatar diambil dari profil provider. */
async function upsertUser(p: Provider, prof: Profile): Promise<string> {
  // 1) sudah pernah login provider ini
  const byProvider = (await db()`
    SELECT id FROM users WHERE provider = ${p} AND provider_id = ${prof.id}
  `) as unknown as { id: string }[];
  if (byProvider[0]) return byProvider[0].id;

  // 2) email sudah terdaftar (akun lokal) -> tautkan provider ke akun itu
  if (prof.email) {
    const byEmail = (await db()`
      SELECT id FROM users WHERE lower(email) = lower(${prof.email})
    `) as unknown as { id: string }[];
    if (byEmail[0]) {
      await db()`
        UPDATE users SET provider = ${p}, provider_id = ${prof.id}, email_verified = true,
          avatar_url = COALESCE(${prof.picture}, avatar_url), nickname = COALESCE(nickname, ${prof.name ?? null})
        WHERE id = ${byEmail[0].id}
      `;
      return byEmail[0].id;
    }
  }

  // 3) akun baru — nickname & avatar menyesuaikan profil penyedia
  const username = await uniqueUsername(prof.email?.split("@")[0] ?? prof.name ?? p);
  const nickname = (prof.name ?? username).slice(0, 32);
  const rows = (await db()`
    INSERT INTO users (username, pass_hash, is_admin, email, nickname, provider, provider_id, email_verified, avatar_url)
    VALUES (
      ${username},
      ${hashPassword(randomBytes(32).toString("hex"))},
      NOT EXISTS (SELECT 1 FROM users),
      ${prof.email},
      ${nickname},
      ${p},
      ${prof.id},
      ${prof.email !== null},
      ${prof.picture}
    )
    ON CONFLICT DO NOTHING
    RETURNING id
  `) as unknown as { id: string }[];
  if (rows[0]) return rows[0].id;
  // tabrakan unik langka: ulangi dengan suffix acak
  const again = (await db()`
    INSERT INTO users (username, pass_hash, is_admin, email, nickname, provider, provider_id, email_verified, avatar_url)
    VALUES (${await uniqueUsername(`${p}_${prof.id}`)}, ${hashPassword(randomBytes(32).toString("hex"))},
            false, ${prof.email}, ${nickname}, ${p}, ${prof.id}, ${prof.email !== null}, ${prof.picture})
    RETURNING id
  `) as unknown as { id: string }[];
  return again[0].id;
}

/** Selesaikan OAuth: validasi state, tukar kode, login. Redirect ke "/" bila sukses. */
export async function finishOAuth(p: Provider, req: Request, origin: string): Promise<NextResponse> {
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const store = await cookies();
  const expected = store.get(STATE_COOKIE)?.value;

  const fail = (msg: string) => NextResponse.redirect(new URL(`/?auth_error=${msg}`, origin), 302);
  if (!code || !state || !expected || state !== expected) return fail("state");

  try {
    const prof = await exchange(p, code, origin);
    const userId = await upsertUser(p, prof);
    const token = await createSessionToken(userId);
    const res = NextResponse.redirect(new URL("/", origin), 302);
    await issueSessionCookie(res, token, userId);
    res.cookies.delete(STATE_COOKIE);
    return res;
  } catch (e) {
    return fail(`provider:${(e as Error).message.slice(0, 60).replace(/[^a-zA-Z0-9:_-]/g, "")}`);
  }
}
