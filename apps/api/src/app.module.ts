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
import { AuthController } from "@/auth/auth.controller";
import { AuthService } from "@/auth/auth.service";
import { EmailService } from "@/auth/email.service";
import { AccessProfilesController } from "@/access/access-profiles.controller";
import { UsersController } from "@/users/users.controller";
import { FiscalIntegrationController } from "@/fiscal/fiscal-integration.controller";
import { CertificateVaultService } from "@/fiscal/certificate-vault.service";
import { FiscalSyncService } from "@/fiscal/fiscal-sync.service";
import { NfeWizardProvider } from "@/fiscal/providers/nfewizard.provider";
import { ApfiscalProvider } from "@/fiscal/providers/apfiscal.provider";
import { FiscalDocumentReconciliationService } from "@/fiscal/fiscal-document-reconciliation.service";
import { NfeManifestationService } from "@/fiscal/nfe-manifestation.service";
import { TotvsController } from "@/totvs/totvs.controller";
import { TotvsSqlServerService } from "@/totvs/totvs-sql-server.service";
import { TotvsSyncService } from "@/totvs/totvs-sync.service";
import { TotvsIntegrationService } from "@/totvs/totvs-integration.service";
import { TotvsQueueService } from "@/totvs/totvs-queue.service";
import { TotvsScopeService } from "@/totvs/totvs-scope.service";
import { TotvsRmWriterService } from "@/totvs/totvs-rm-writer.service";
import { SuperadminController } from "@/superadmin/superadmin.controller";
import { SuperadminBootstrapService } from "@/superadmin/superadmin-bootstrap.service";
import { PlanLimitsService } from "@/plans/plan-limits.service";
import { PublicPlansController } from "@/plans/public-plans.controller";
import { NacionalAdnNfseProvider } from "@/nfse/nacional-adn-nfse.provider";
import { NfseSyncService } from "@/nfse/nfse-sync.service";
import { FiscalDocumentsController } from "@/fiscal-documents/fiscal-documents.controller";
import { FiscalDocumentsService } from "@/fiscal-documents/fiscal-documents.service";

@Module({
  imports: [ThrottlerModule.forRoot([{ ttl: 60_000, limit: 120 }])],
  controllers: [
    HealthController,
    ActionsController,
    DataProxyController,
    MeController,
    AuthController,
    AccessProfilesController,
    UsersController,
    FiscalIntegrationController,
    TotvsController,
    SuperadminController,
    FiscalDocumentsController,
    PublicPlansController,
  ],
  providers: [
    AuthService,
    EmailService,
    RbacService,
    CertificateVaultService,
    FiscalSyncService,
    FiscalDocumentReconciliationService,
    NfeManifestationService,
    NfeWizardProvider,
    ApfiscalProvider,
    TotvsSqlServerService,
    TotvsSyncService,
    TotvsIntegrationService,
    TotvsQueueService,
    TotvsScopeService,
    TotvsRmWriterService,
    SuperadminBootstrapService,
    PlanLimitsService,
    NacionalAdnNfseProvider,
    NfseSyncService,
    FiscalDocumentsService,
    { provide: APP_GUARD, useClass: AuthGuard },
    { provide: APP_GUARD, useClass: PermissionGuard },
    { provide: APP_GUARD, useClass: ThrottlerGuard },
  ],
})
export class AppModule {}
