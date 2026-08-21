import { afterEach, describe, expect, it, vi } from "vitest";

const mail = vi.hoisted(() => {
  const sendMail = vi.fn().mockResolvedValue({ messageId: "test" });
  return { sendMail, createTransport: vi.fn(() => ({ sendMail })) };
});
vi.mock("nodemailer", () => ({ createTransport: mail.createTransport }));

import { EmailService } from "./email.service";

describe("EmailService", () => {
  afterEach(() => {
    vi.clearAllMocks();
    delete process.env.SMTP_HOST; delete process.env.SMTP_PORT; delete process.env.MAIL_FROM;
  });

  it("creates the SMTP transport and sends the access email", async () => {
    process.env.SMTP_HOST = "smtp.example.com";
    process.env.SMTP_PORT = "587";
    process.env.MAIL_FROM = "APFiscal <no-reply@example.com>";
    await new EmailService().sendAccessEmail({ to: "person@example.com", subject: "Teste", title: "Título", message: "Mensagem", actionLabel: "Abrir", actionUrl: "https://example.com/token" });
    expect(mail.createTransport).toHaveBeenCalledWith(expect.objectContaining({ host: "smtp.example.com", port: 587 }));
    expect(mail.sendMail).toHaveBeenCalledWith(expect.objectContaining({ to: "person@example.com", subject: "Teste" }));
  });
});
