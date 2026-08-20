import { CanActivate, ExecutionContext, Injectable } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { PERMISSION_KEY } from "./permission.decorator";
import type { AuthenticatedRequest } from "./request-user";
import { RbacService } from "./rbac.service";

@Injectable()
export class PermissionGuard implements CanActivate {
  constructor(private readonly reflector: Reflector, private readonly rbac: RbacService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const permission = this.reflector.getAllAndOverride<string>(PERMISSION_KEY, [context.getHandler(), context.getClass()]);
    if (!permission) return true;
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    await this.rbac.assertPermission(request.user.id, permission);
    return true;
  }
}
