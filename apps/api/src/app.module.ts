import { Module } from "@nestjs/common";
import { APP_GUARD } from "@nestjs/core";
import { ThrottlerGuard, ThrottlerModule } from "@nestjs/throttler";
import { AuthGuard } from "@/common/auth.guard";
import { PermissionGuard } from "@/common/permission.guard";
import { RbacService } from "@/common/rbac.service";
import { HealthController } from "@/health/health.controller";
import { ActionsController } from "@/actions/actions.controller";
import { DataProxyController } from "@/data-proxy/data-proxy.controller";
import { MeController } from "@/auth/me.controller";
import { AccessProfilesController } from "@/access/access-profiles.controller";
import { UsersController } from "@/users/users.controller";
import { FiscalIntegrationController } from "@/fiscal/fiscal-integration.controller";
import { CertificateVaultService } from "@/fiscal/certificate-vault.service";
import { FiscalSyncService } from "@/fiscal/fiscal-sync.service";
import { NfeWizardProvider } from "@/fiscal/providers/nfewizard.provider";
import { ApfiscalProvider } from "@/fiscal/providers/apfiscal.provider";

@Module({
  imports: [ThrottlerModule.forRoot([{ ttl: 60_000, limit: 120 }])],
  controllers: [HealthController, ActionsController, DataProxyController, MeController, AccessProfilesController, UsersController, FiscalIntegrationController],
  providers: [
    RbacService,
    CertificateVaultService,
    FiscalSyncService,
    NfeWizardProvider,
    ApfiscalProvider,
    { provide: APP_GUARD, useClass: AuthGuard },
    { provide: APP_GUARD, useClass: PermissionGuard },
    { provide: APP_GUARD, useClass: ThrottlerGuard },
  ],
})
export class AppModule {}
