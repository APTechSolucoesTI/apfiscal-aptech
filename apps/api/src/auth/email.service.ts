import { Injectable, ServiceUnavailableException } from "@nestjs/common";
import nodemailer from "nodemailer";

@Injectable()
export class EmailService {
  private configured() {
    return Boolean(process.env.SMTP_HOST?.trim() && process.env.SMTP_PORT?.trim() && process.env.MAIL_FROM?.trim());
  }

  ensureConfigured() {
    if (!this.configured()) throw new ServiceUnavailableException("O envio de e-mail ainda não foi configurado. Preencha SMTP_HOST, SMTP_PORT e MAIL_FROM.");
  }

  private transport() {
    this.ensureConfigured();
    return nodemailer.createTransport({
      host: process.env.SMTP_HOST!.trim(),
      port: Number(process.env.SMTP_PORT),
      secure: process.env.SMTP_SECURE === "true",
      auth: process.env.SMTP_USER?.trim() ? { user: process.env.SMTP_USER.trim(), pass: process.env.SMTP_PASSWORD ?? "" } : undefined,
    });
  }

  async sendAccessEmail(input: { to: string; subject: string; title: string; message: string; actionLabel: string; actionUrl: string }) {
    const transport = this.transport();
    await transport.sendMail({
      from: process.env.MAIL_FROM!.trim(),
      to: input.to,
      subject: input.subject,
      text: `${input.title}\n\n${input.message}\n\n${input.actionLabel}: ${input.actionUrl}\n\nSe você não solicitou esta ação, ignore este e-mail.`,
      html: `<main style="font-family:Arial,sans-serif;max-width:560px;margin:auto;color:#0f172a"><h1 style="font-size:22px">${escapeHtml(input.title)}</h1><p>${escapeHtml(input.message)}</p><p style="margin:28px 0"><a href="${escapeAttribute(input.actionUrl)}" style="display:inline-block;background:#2563eb;color:white;padding:12px 20px;border-radius:6px;text-decoration:none;font-weight:600">${escapeHtml(input.actionLabel)}</a></p><p style="color:#64748b;font-size:13px">Se você não solicitou esta ação, ignore este e-mail.</p></main>`,
    });
  }
}

function escapeHtml(value: string) { return value.replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]!); }
function escapeAttribute(value: string) { return escapeHtml(value); }
