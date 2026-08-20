import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { createClient } from "@supabase/supabase-js";
import { env } from "@/config/env";
import { createUserSupabase } from "@/integrations/supabase/client.server";
import { IS_PUBLIC_KEY } from "./public.decorator";
import type { AuthenticatedRequest } from "./request-user";

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    if (this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [context.getHandler(), context.getClass()])) return true;
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const auth = request.headers.authorization;
    if (!auth?.startsWith("Bearer ")) throw new UnauthorizedException("Sessão ausente ou inválida.");
    const token = auth.slice(7);
    const verifier = createClient(env("SUPABASE_URL"), env("SUPABASE_PUBLISHABLE_KEY"), {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data, error } = await verifier.auth.getUser(token);
    if (error || !data.user) throw new UnauthorizedException("Sessão expirada ou inválida.");
    request.accessToken = token;
    request.user = data.user;
    request.supabase = createUserSupabase(token);
    return true;
  }
}
