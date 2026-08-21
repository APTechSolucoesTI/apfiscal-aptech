import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { AuthService } from "@/auth/auth.service";
import { createUserSupabase } from "@/integrations/supabase/client.server";
import { SESSION_COOKIE, verifySessionToken } from "@/auth/session-token";
import { IS_PUBLIC_KEY } from "./public.decorator";
import type { AuthenticatedRequest } from "./request-user";

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(private readonly reflector: Reflector, private readonly authService: AuthService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    if (this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [context.getHandler(), context.getClass()])) return true;
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const token = cookie(request.headers.cookie, SESSION_COOKIE);
    const claims = token ? verifySessionToken(token) : null;
    if (!token || !claims) throw new UnauthorizedException("Sessão ausente ou inválida.");
    const user = await this.authService.validateSession(claims.sid, token, claims.sub);
    if (!user) throw new UnauthorizedException("Sessão expirada ou inválida.");
    request.sessionId = claims.sid;
    request.user = user;
    request.supabase = createUserSupabase(user);
    return true;
  }
}

function cookie(header: string | undefined, name: string): string | null {
  if (!header) return null;
  const prefix = `${name}=`;
  const entry = header.split(";").map((item) => item.trim()).find((item) => item.startsWith(prefix));
  return entry ? decodeURIComponent(entry.slice(prefix.length)) : null;
}
