// language: TypeScript, file: lib/mail.ts, target: kirim email OTP via Gmail SMTP
import nodemailer from "nodemailer";
import type { Transporter } from "nodemailer";

/** Akun pengirim — App Password diambil dari env (nilainya tidak pernah di-log). */
const SMTP_USER = process.env.SMTP_USER || "onheilberkarya@gmail.com";
const SMTP_PASS = process.env.GMAIL_APP_PASSWORD || process.env.SMTP_PASS || "";

export function mailReady(): boolean {
  return SMTP_PASS.length > 0;
}

let cached: Transporter | null = null;

export async function sendOtpEmail(to: string, code: string): Promise<void> {
  if (!mailReady()) throw new Error("SMTP belum dikonfigurasi (GMAIL_APP_PASSWORD kosong)");
  if (!cached) {
    cached = nodemailer.createTransport({
      host: "smtp.gmail.com",
      port: 587,
      secure: false,
      auth: { user: SMTP_USER, pass: SMTP_PASS },
    });
  }
  const html = [
    `<div style="font-family:system-ui,sans-serif;max-width:420px;margin:auto;padding:24px;border:1px solid #e5e7eb;border-radius:12px">`,
    `<p style="font-size:13px;color:#6b7280;margin:0 0 4px">OnheilAI</p>`,
    `<h2 style="margin:0 0 12px;font-size:18px">Kode verifikasi kamu</h2>`,
    `<p style="font-size:32px;letter-spacing:8px;font-weight:700;margin:0 0 16px">${code}</p>`,
    `<p style="font-size:13px;color:#6b7280;margin:0">Berlaku 10 menit. Jangan bagikan kode ini ke siapa pun.</p>`,
    `</div>`,
  ].join("");
  await cached.sendMail({
    from: `"OnheilAI" <${SMTP_USER}>`,
    to,
    subject: `Kode verifikasi OnheilAI: ${code}`,
    text: `Kode verifikasi kamu: ${code}\nBerlaku 10 menit. Jangan bagikan kode ini ke siapa pun.`,
    html,
  });
}
