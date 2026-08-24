import { Injectable, Logger, OnModuleInit } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import { hashPassword } from "@/auth/password";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

@Injectable()
export class SuperadminBootstrapService implements OnModuleInit {
  private readonly logger = new Logger(SuperadminBootstrapService.name);

  async onModuleInit() {
    const email = (process.env.SUPERADMIN_EMAIL ?? "superadmin@aptechinfo.com.br").trim().toLowerCase();
    const existing = await supabaseAdmin.from("users").select("id, is_superadmin").ilike("email", email).maybeSingle();
    if (existing.error) throw existing.error;
    if (existing.data) {
      if (!existing.data.is_superadmin) this.logger.error(`O e-mail ${email} já pertence a uma conta comum; o bootstrap recusou a elevação automática.`);
      return;
    }
    const password = process.env.SUPERADMIN_INITIAL_PASSWORD?.trim();
    if (!password) {
      this.logger.warn("SUPERADMIN_INITIAL_PASSWORD ausente; o superadmin inicial ainda não foi criado.");
      return;
    }
    if (password.length < 14 || !/[A-Z]/.test(password) || !/[a-z]/.test(password) || !/\d/.test(password) || !/[^\w]/.test(password)) {
      throw new Error("SUPERADMIN_INITIAL_PASSWORD deve ter 14+ caracteres, maiúscula, minúscula, número e símbolo.");
    }
    const created = await supabaseAdmin.from("users").insert({
      id: randomUUID(), email, full_name: "Super Admin APFiscal", password_hash: await hashPassword(password),
      active: true, email_verified_at: new Date().toISOString(), is_superadmin: true, plan_key: "platform",
    });
    if (created.error) throw created.error;
    this.logger.log(`Superadmin inicial criado para ${email}. Remova SUPERADMIN_INITIAL_PASSWORD após o primeiro deploy.`);
  }
}
