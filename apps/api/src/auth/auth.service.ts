import { ConflictException, Injectable, UnauthorizedException } from "@nestjs/common";
import { randomBytes, randomUUID } from "node:crypto";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { EmailService } from "./email.service";
import { hashPassword, verifyPassword } from "./password";
import { createSessionToken, hashToken, type AppUser } from "./session-token";
import { PlanLimitsService } from "@/plans/plan-limits.service";

type TokenKind = "verify_email" | "set_password" | "reset_password";
type StoredUser = AppUser & {
  password_hash: string | null;
  active: boolean;
  email_verified_at: string | null;
  is_superadmin: boolean;
};

@Injectable()
export class AuthService {
  constructor(
    private readonly email: EmailService,
    private readonly plans: PlanLimitsService,
  ) {}

  async register(input: { fullName: string; email: string; password: string }) {
    this.email.ensureConfigured();
    const email = normalizeEmail(input.email);
    const existing = await supabaseAdmin
      .from("users")
      .select("id")
      .ilike("email", email)
      .maybeSingle();
    if (existing.error) throw existing.error;
    if (existing.data) throw new ConflictException("Já existe uma conta APFiscal com este e-mail.");
    const id = randomUUID();
    const user = await supabaseAdmin
      .from("users")
      .insert({
        id,
        email,
        full_name: input.fullName,
        password_hash: await hashPassword(input.password),
        active: true,
        email_verified_at: null,
      })
      .select("id, email, full_name")
      .single();
    if (user.error) throw user.error;
    const organization = await supabaseAdmin
      .from("organizations")
      .insert({ name: organizationName(input.fullName, email) })
      .select("id")
      .single();
    if (organization.error) throw organization.error;
    const membership = await supabaseAdmin
      .from("organization_members")
      .insert({ organization_id: organization.data.id, user_id: id, role: "admin", active: true });
    if (membership.error) throw membership.error;
    await this.sendToken({ id, email, fullName: input.fullName }, "verify_email");
    return { status: "confirmation_required" as const };
  }

  async login(emailInput: string, password: string) {
    const user = await this.findUser(emailInput);
    if (!user || !user.active || !(await verifyPassword(password, user.password_hash)))
      throw new UnauthorizedException("E-mail ou senha inválidos.");
    if (!user.email_verified_at)
      throw new UnauthorizedException(
        "Confirme seu e-mail antes de entrar. Solicite um novo link se necessário.",
      );
    if (!user.is_superadmin) {
      const membership = await supabaseAdmin
        .from("organization_members")
        .select("id")
        .eq("user_id", user.id)
        .eq("active", true)
        .limit(1)
        .maybeSingle();
      if (membership.error) throw membership.error;
      if (!membership.data)
        throw new UnauthorizedException(
          "Sua conta não possui acesso a uma organização APFiscal ativa.",
        );
    }
    const session = createSessionToken(user);
    const stored = await supabaseAdmin
      .from("user_sessions")
      .insert({
        id: session.claims.sid,
        user_id: user.id,
        token_hash: hashToken(session.token),
        expires_at: new Date(session.claims.exp * 1000).toISOString(),
      });
    if (stored.error) throw stored.error;
    await supabaseAdmin
      .from("users")
      .update({ last_login_at: new Date().toISOString() })
      .eq("id", user.id);
    return {
      token: session.token,
      user: { id: user.id, email: user.email, fullName: user.fullName ?? null },
    };
  }

  async logout(sessionId: string) {
    await supabaseAdmin
      .from("user_sessions")
      .update({ revoked_at: new Date().toISOString() })
      .eq("id", sessionId)
      .is("revoked_at", null);
  }

  async validateSession(sessionId: string, rawToken: string, userId: string) {
    const session = await supabaseAdmin
      .from("user_sessions")
      .select(
        "id, user_id, token_hash, expires_at, revoked_at, users(id, email, full_name, active)",
      )
      .eq("id", sessionId)
      .maybeSingle();
    if (
      session.error ||
      !session.data ||
      session.data.user_id !== userId ||
      session.data.token_hash !== hashToken(rawToken) ||
      session.data.revoked_at ||
      new Date(session.data.expires_at).getTime() <= Date.now()
    )
      return null;
    const user = session.data.users as unknown as StoredUser | null;
    if (!user?.active) return null;
    return { id: user.id, email: user.email, fullName: user.fullName } satisfies AppUser;
  }

  async requestPasswordReset(emailInput: string) {
    this.email.ensureConfigured();
    const user = await this.findUser(emailInput);
    if (user?.active) await this.sendToken(user, "reset_password");
  }

  async completeToken(token: string, kind: TokenKind, password?: string) {
    const tokenHash = hashToken(token);
    const row = await supabaseAdmin
      .from("user_email_tokens")
      .select("id, user_id, token_type, expires_at, used_at, users(id, email, full_name, active)")
      .eq("token_hash", tokenHash)
      .eq("token_type", kind)
      .maybeSingle();
    if (
      row.error ||
      !row.data ||
      row.data.used_at ||
      new Date(row.data.expires_at).getTime() <= Date.now()
    )
      throw new UnauthorizedException("Este link é inválido ou expirou. Solicite um novo e-mail.");
    const user = row.data.users as unknown as StoredUser | null;
    if (!user?.active) throw new UnauthorizedException("Esta conta não está disponível.");
    if ((kind === "set_password" || kind === "reset_password") && !password)
      throw new UnauthorizedException("Informe uma nova senha válida.");
    const updates: Record<string, unknown> = {
      email_verified_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    if (password) updates.password_hash = await hashPassword(password);
    const [used, updated] = await Promise.all([
      supabaseAdmin
        .from("user_email_tokens")
        .update({ used_at: new Date().toISOString() })
        .eq("id", row.data.id)
        .is("used_at", null),
      supabaseAdmin.from("users").update(updates).eq("id", user.id),
    ]);
    if (used.error) throw used.error;
    if (updated.error) throw updated.error;
  }

  async invite(input: {
    fullName: string;
    email: string;
    organizationId: string;
    profileId: string;
    companyIds: string[];
  }) {
    this.email.ensureConfigured();
    await this.plans.assertCanAddUser(input.organizationId);
    const email = normalizeEmail(input.email);
    const existing = await supabaseAdmin
      .from("users")
      .select("id")
      .ilike("email", email)
      .maybeSingle();
    if (existing.error) throw existing.error;
    if (existing.data) throw new ConflictException("Este e-mail já possui uma conta APFiscal.");
    const id = randomUUID();
    const user = await supabaseAdmin
      .from("users")
      .insert({ id, email, full_name: input.fullName, active: true, email_verified_at: null })
      .select("id, email, full_name")
      .single();
    if (user.error) throw user.error;
    const membership = await supabaseAdmin
      .from("organization_members")
      .insert({
        organization_id: input.organizationId,
        user_id: id,
        profile_id: input.profileId,
        role: "visualizador",
        active: true,
      });
    if (membership.error) throw membership.error;
    if (input.companyIds.length) {
      const access = await supabaseAdmin
        .from("company_access")
        .insert(input.companyIds.map((company_id) => ({ user_id: id, company_id })));
      if (access.error) throw access.error;
    }
    await this.sendToken({ id, email, fullName: input.fullName }, "set_password");
    return { id, email, status: "invited" as const };
  }

  async verifyCurrentPassword(userId: string, emailInput: string, password: string) {
    const user = await this.findUser(emailInput);
    return Boolean(
      user &&
      user.id === userId &&
      user.active &&
      (await verifyPassword(password, user.password_hash)),
    );
  }

  private async findUser(emailInput: string): Promise<StoredUser | null> {
    const result = await supabaseAdmin
      .from("users")
      .select("id, email, full_name, password_hash, active, email_verified_at, is_superadmin")
      .ilike("email", normalizeEmail(emailInput))
      .maybeSingle();
    if (result.error) throw result.error;
    return result.data ? { ...result.data, fullName: result.data.full_name } : null;
  }

  private async sendToken(user: AppUser, kind: TokenKind) {
    const rawToken = randomBytes(32).toString("base64url");
    const removed = await supabaseAdmin
      .from("user_email_tokens")
      .delete()
      .eq("user_id", user.id)
      .eq("token_type", kind)
      .is("used_at", null);
    if (removed.error) throw removed.error;
    const created = await supabaseAdmin
      .from("user_email_tokens")
      .insert({
        user_id: user.id,
        token_hash: hashToken(rawToken),
        token_type: kind,
        expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
      });
    if (created.error) throw created.error;
    const base = (process.env.PUBLIC_APP_URL ?? "http://localhost:3000").replace(/\/$/, "");
    const pages = {
      verify_email: {
        path: "/auth/verify-email",
        subject: "Confirme seu acesso ao APFiscal",
        title: "Confirme seu e-mail",
        message: "Use o link abaixo para ativar sua conta APFiscal.",
        label: "Confirmar e-mail",
      },
      set_password: {
        path: "/auth/activate",
        subject: "Você foi convidado para o APFiscal",
        title: "Defina sua senha",
        message: "Use o link abaixo para criar sua senha e ativar seu acesso ao APFiscal.",
        label: "Ativar acesso",
      },
      reset_password: {
        path: "/auth/reset-password",
        subject: "Redefinição de senha do APFiscal",
        title: "Redefina sua senha",
        message: "Use o link abaixo para definir uma nova senha.",
        label: "Redefinir senha",
      },
    }[kind];
    await this.email.sendAccessEmail({
      to: user.email,
      subject: pages.subject,
      title: pages.title,
      message: pages.message,
      actionLabel: pages.label,
      actionUrl: `${base}${pages.path}?token=${encodeURIComponent(rawToken)}`,
    });
  }
}

function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}
function organizationName(fullName: string, email: string) {
  return `${fullName.trim() || email.split("@")[0]} — Organização`;
}
