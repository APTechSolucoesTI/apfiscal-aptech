import {
  BadRequestException,
  Controller,
  Get,
  Param,
  Post,
  Req,
  UploadedFile,
  UseInterceptors,
} from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import { RequirePermission } from "@/common/permission.decorator";
import type { AuthenticatedRequest } from "@/common/request-user";
import { FiscalDocumentsService } from "./fiscal-documents.service";
import { NfseSyncService } from "@/nfse/nfse-sync.service";
import { FiscalDocumentReconciliationService } from "@/fiscal/fiscal-document-reconciliation.service";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

@Controller("fiscal-documents")
export class FiscalDocumentsController {
  constructor(
    private readonly documents: FiscalDocumentsService,
    private readonly nfseSync: NfseSyncService,
    private readonly nfeReconciliation: FiscalDocumentReconciliationService,
  ) {}

  @RequirePermission("documents.nfse.view")
  @Get("nfse")
  listNfse(@Req() request: AuthenticatedRequest) {
    return this.documents.listNfse(request.user.id);
  }

  @RequirePermission("documents.nfse.view")
  @Get("nfse/:id")
  nfseDetails(@Param("id") id: string, @Req() request: AuthenticatedRequest) {
    return this.documents.nfseDetails(request.user.id, id);
  }

  @RequirePermission("documents.nfse.view")
  @Get(":id/xml")
  xml(@Param("id") id: string, @Req() request: AuthenticatedRequest) {
    return this.documents.xml(request.user.id, id);
  }

  @RequirePermission("documents.nfse.manage")
  @Post("nfse/backfill/:companyId")
  async backfillNfse(@Param("companyId") companyId: string, @Req() request: AuthenticatedRequest) {
    await this.documents.assertCompanyAccess(request.user.id, companyId);
    return this.nfseSync.backfill(companyId);
  }

  @RequirePermission("documents.nfe.manage")
  @Post("nfe-summary/backfill/:companyId")
  async backfillNfeSummary(
    @Param("companyId") companyId: string,
    @Req() request: AuthenticatedRequest,
  ) {
    await this.documents.assertCompanyAccess(request.user.id, companyId);
    return this.nfeReconciliation.backfillMetadata(companyId);
  }

  @RequirePermission("documents.nfe.manage")
  @Post("reconcile-totvs/:companyId")
  async reconcileTotvs(@Param("companyId") companyId: string, @Req() request: AuthenticatedRequest) {
    await this.documents.assertCompanyAccess(request.user.id, companyId);
    const company = await supabaseAdmin
      .from("companies")
      .select("organization_id")
      .eq("id", companyId)
      .single();
    if (company.error || !company.data)
      throw new BadRequestException("Empresa não encontrada para reconciliação.");
    return this.nfeReconciliation.reconcileExistingTotvs(
      company.data.organization_id,
      companyId,
    );
  }

  @RequirePermission("documents.nfse.manage")
  @Post("nfse/import")
  @UseInterceptors(FileInterceptor("xml", { limits: { fileSize: 10 * 1024 * 1024, files: 1 } }))
  importNfse(@UploadedFile() file: Express.Multer.File, @Req() request: AuthenticatedRequest) {
    if (!file?.buffer?.length || !/\.xml$/i.test(file.originalname))
      throw new BadRequestException("Envie um arquivo XML válido.");
    return this.documents.importNfse(
      request.user.id,
      file.originalname,
      file.buffer.toString("utf8"),
    );
  }
}
