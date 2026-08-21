import { Body, Controller, HttpCode, Post, Req, Res } from "@nestjs/common";
import type { Response } from "express";
import { z } from "zod";
import { Public } from "@/common/public.decorator";
import type { AuthenticatedRequest } from "@/common/request-user";
import { AuthService } from "./auth.service";
import { SESSION_COOKIE, sessionMaxAgeMs } from "./session-token";

const password = z.string().min(12, "A senha deve ter pelo menos 12 caracteres.").max(128);
const credentials = z.object({ email: z.string().trim().email("Informe um e-mail válido."), password });

@Controller("auth")
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Public()
  @Post("register")
  async register(@Body() raw: unknown) {
    const input = credentials.extend({ fullName: z.string().trim().min(2).max(120) }).parse(raw);
    return this.auth.register(input);
  }

  @Public()
  @HttpCode(200)
  @Post("login")
  async login(@Body() raw: unknown, @Res({ passthrough: true }) response: Response) {
    const input = credentials.parse(raw);
    const result = await this.auth.login(input.email, input.password);
    response.cookie(SESSION_COOKIE, result.token, { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", maxAge: sessionMaxAgeMs() });
    return { user: result.user };
  }

  @HttpCode(204)
  @Post("logout")
  async logout(@Req() request: AuthenticatedRequest, @Res({ passthrough: true }) response: Response) {
    await this.auth.logout(request.sessionId);
    response.clearCookie(SESSION_COOKIE, { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/" });
  }

  @Public()
  @HttpCode(202)
  @Post("forgot-password")
  async forgotPassword(@Body() raw: unknown) {
    const input = z.object({ email: z.string().trim().email() }).parse(raw);
    await this.auth.requestPasswordReset(input.email);
    return { accepted: true };
  }

  @Public()
  @HttpCode(204)
  @Post("verify-email")
  async verifyEmail(@Body() raw: unknown) {
    const input = z.object({ token: z.string().min(20) }).parse(raw);
    await this.auth.completeToken(input.token, "verify_email");
  }

  @Public()
  @HttpCode(204)
  @Post("activate")
  async activate(@Body() raw: unknown) {
    const input = z.object({ token: z.string().min(20), password }).parse(raw);
    await this.auth.completeToken(input.token, "set_password", input.password);
  }

  @Public()
  @HttpCode(204)
  @Post("reset-password")
  async resetPassword(@Body() raw: unknown) {
    const input = z.object({ token: z.string().min(20), password }).parse(raw);
    await this.auth.completeToken(input.token, "reset_password", input.password);
  }
}
