"use client";

import { useQuery } from "@tanstack/react-query";
import { useRouter } from "@/lib/router-compat";
import { toast } from "sonner";
import {
  AlertCircle,
  ArrowLeft,
  Building2,
  CalendarDays,
  CheckCircle2,
  Clock3,
  Code2,
  Copy,
  Download,
  FileClock,
  FileText,
  Landmark,
  Loader2,
  ReceiptText,
  UserRound,
  WalletCards,
} from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { FiscalStatusBadge, TotvsStatusBadge } from "@/components/fiscal/FiscalStatusBadge";
import { maskCnpjCpf, maskCep } from "@/lib/br-format";
import { baixarXmlUnico } from "@/lib/xml-zip";
import { getFiscalXml, getNfse } from "@/services/fiscalDocumentsService";
import { NfseTotvsPanel } from "@/components/nfse/NfseTotvsPanel";

type RecordValue = Record<string, unknown>;
const record = (value: unknown): RecordValue =>
  value && typeof value === "object" && !Array.isArray(value) ? (value as RecordValue) : {};
const text = (value: unknown) =>
  value === null || value === undefined || value === "" ? "—" : String(value);
const money = (value: unknown) =>
  Number(value ?? 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const dateTime = (value: unknown) =>
  value ? new Date(String(value)).toLocaleString("pt-BR") : "—";
const date = (value: unknown) =>
  value ? new Date(String(value)).toLocaleDateString("pt-BR") : "—";

function Field({ label, value, mono = false }: { label: string; value: unknown; mono?: boolean }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs font-medium text-slate-500">{label}</dt>
      <dd
        className={`mt-1 break-words text-sm font-medium text-slate-900 ${mono ? "font-mono" : ""}`}
      >
        {text(value)}
      </dd>
    </div>
  );
}

function EntityCard({
  title,
  icon: Icon,
  entity,
}: {
  title: string;
  icon: typeof Building2;
  entity: RecordValue;
}) {
  const address = record(entity.address);
  const taxId = text(entity.taxId);
  return (
    <Card className="border-slate-200 shadow-none">
      <CardHeader className="flex flex-row items-center gap-2 pb-3">
        <Icon className="h-4 w-4 text-primary" />
        <CardTitle className="text-base">{title}</CardTitle>
      </CardHeader>
      <CardContent>
        <dl className="grid gap-4 sm:grid-cols-2">
          <Field label="Nome / razão social" value={entity.name} />
          <Field label="Nome fantasia" value={entity.tradeName} />
          <Field label="CPF/CNPJ" value={taxId !== "—" ? maskCnpjCpf(taxId) : taxId} />
          <Field label="Inscrição municipal" value={entity.municipalRegistration} />
          <Field label="Inscrição estadual" value={entity.stateRegistration} />
          <Field label="Telefone" value={entity.phone} />
          <Field label="E-mail" value={entity.email} />
          <Field
            label="Logradouro"
            value={[address.street, address.number, address.complement].filter(Boolean).join(", ")}
          />
          <Field label="Bairro" value={address.district} />
          <Field
            label="Município / UF"
            value={[address.municipalityName, address.state].filter(Boolean).join(" / ")}
          />
          <Field label="CEP" value={address.zipCode ? maskCep(String(address.zipCode)) : null} />
          <Field label="Código do município" value={address.municipalityCode} mono />
        </dl>
      </CardContent>
    </Card>
  );
}

export function NfseDetails({ id }: { id: string }) {
  const router = useRouter();
  const query = useQuery({ queryKey: ["nfse-detail", id], queryFn: () => getNfse(id) });
  if (query.isLoading)
    return (
      <div className="space-y-4 p-2">
        <div className="flex items-center justify-center py-32 text-slate-500">
          <Loader2 className="mr-2 h-5 w-5 animate-spin" />
          Carregando NFS-e...
        </div>
      </div>
    );
  if (query.isError)
    return (
      <Alert variant="destructive">
        <AlertCircle className="h-4 w-4" />
        <AlertTitle>Falha ao abrir NFS-e</AlertTitle>
        <AlertDescription>
          {(query.error as Error).message}
          <Button
            variant="outline"
            size="sm"
            className="mt-3 block"
            onClick={() => query.refetch()}
          >
            Tentar novamente
          </Button>
        </AlertDescription>
      </Alert>
    );
  if (!query.data)
    return (
      <div className="py-20 text-center">
        <p className="font-medium">NFS-e não encontrada.</p>
        <Button
          variant="outline"
          className="mt-4"
          onClick={() => router.navigate({ to: "/documents/nfse" })}
        >
          Voltar
        </Button>
      </div>
    );

  const { document: doc, history, runs, distribution } = query.data;
  const details = record(doc.nfse_details);
  const issuer = record(details.issuer);
  const recipient = record(details.recipient);
  const service = record(details.service);
  const taxes = record(details.taxes);
  const latestRun = runs[0] ?? null;
  const downloadXml = async () => {
    try {
      const result = await getFiscalXml(id);
      baixarXmlUnico(result.filename, result.xml);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Falha ao baixar XML.");
    }
  };

  return (
    <div className="space-y-5 pb-8">
      <header className="sticky top-0 z-10 -mx-4 border-b border-slate-200 bg-background/95 px-4 py-4 backdrop-blur supports-[backdrop-filter]:bg-background/85 sm:mx-0 sm:rounded-xl sm:border">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex min-w-0 items-start gap-3">
            <Button
              variant="outline"
              size="icon"
              aria-label="Voltar para NFS-e"
              onClick={() => router.navigate({ to: "/documents/nfse" })}
            >
              <ArrowLeft className="h-4 w-4" />
            </Button>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="text-xl font-semibold text-slate-950">NFS-e nº {doc.numero}</h1>
                <FiscalStatusBadge status={doc.sync_status} />
                <TotvsStatusBadge status={latestRun?.status} />
              </div>
              <p
                className="mt-1 truncate font-mono text-xs text-slate-500"
                title={doc.chave_acesso}
              >
                {doc.chave_acesso}
              </p>
              <p className="mt-1 text-sm text-slate-600">
                {doc.emitente_nome || "Prestador não informado"} ·{" "}
                {doc.companies?.nome_fantasia || doc.companies?.razao_social}
              </p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                navigator.clipboard.writeText(doc.chave_acesso);
                toast.success("Chave copiada.");
              }}
            >
              <Copy className="mr-2 h-4 w-4" />
              Copiar chave
            </Button>
            <Button size="sm" onClick={downloadXml} disabled={!doc.xml_content}>
              <Download className="mr-2 h-4 w-4" />
              Baixar XML
            </Button>
          </div>
        </div>
      </header>

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {[
          {
            label: "Valor bruto",
            value: money(doc.service_gross_value ?? doc.valor_total),
            detail: `Líquido ${money(doc.service_net_value ?? doc.valor_total)}`,
            icon: WalletCards,
          },
          {
            label: "Emissão",
            value: date(doc.data_emissao),
            detail: `Competência ${date(doc.competence_date)}`,
            icon: CalendarDays,
          },
          {
            label: "ISS",
            value: money(doc.iss_value),
            detail:
              doc.iss_rate == null
                ? "Alíquota não informada"
                : `Alíquota ${Number(doc.iss_rate).toLocaleString("pt-BR")}%`,
            icon: Landmark,
          },
          {
            label: "Origem",
            value: distribution?.provider || doc.source_provider || "Manual",
            detail: distribution
              ? `NSU ${distribution.nsu} · recebido ${date(distribution.received_at)}`
              : "Sem NSU de distribuição",
            icon: FileText,
          },
        ].map((item) => (
          <Card key={item.label} className="border-slate-200 shadow-none">
            <CardContent className="flex gap-3 p-4">
              <div className="h-fit rounded-lg bg-blue-50 p-2 text-blue-700">
                <item.icon className="h-4 w-4" />
              </div>
              <div>
                <p className="text-xs text-slate-500">{item.label}</p>
                <p className="mt-1 font-semibold tabular-nums text-slate-950">{item.value}</p>
                <p className="mt-1 text-[11px] text-slate-500">{item.detail}</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </section>

      <Tabs defaultValue="summary">
        <TabsList className="h-auto w-full justify-start overflow-x-auto rounded-none border-b bg-transparent p-0">
          {[
            ["summary", "Resumo"],
            ["issuer", "Prestador"],
            ["recipient", "Tomador"],
            ["service", "Serviço"],
            ["taxes", "Impostos"],
            ["xml", "XML"],
            ["totvs", "TOTVS"],
            ["history", "Histórico"],
          ].map(([value, label]) => (
            <TabsTrigger
              key={value}
              value={value}
              className="rounded-none border-b-2 border-transparent px-4 py-3 data-[state=active]:border-primary data-[state=active]:bg-transparent"
            >
              {label}
            </TabsTrigger>
          ))}
        </TabsList>
        <TabsContent value="summary" className="mt-5 grid gap-4 lg:grid-cols-3">
          <Card className="border-slate-200 shadow-none lg:col-span-2">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <ReceiptText className="h-4 w-4 text-primary" />
                Identificação
              </CardTitle>
            </CardHeader>
            <CardContent>
              <dl className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                <Field label="Número" value={doc.numero} />
                <Field label="Série" value={doc.serie} />
                <Field label="Código de verificação" value={doc.verification_code} mono />
                <Field label="Emissão" value={dateTime(doc.data_emissao)} />
                <Field label="Competência" value={date(doc.competence_date)} />
                <Field label="Status fiscal" value={doc.situacao} />
                <Field label="Município emissor/prestação" value={doc.service_municipality_name} />
                <Field label="Município de incidência" value={doc.incidence_municipality_name} />
                <Field label="Natureza da operação" value={doc.natureza_operacao} />
                <Field label="Regime tributário" value={doc.tax_regime} />
                <Field label="Regime especial" value={doc.special_tax_regime} />
                <Field label="Último processamento" value={dateTime(doc.last_sync_success_at)} />
              </dl>
            </CardContent>
          </Card>
          <Card className="border-slate-200 shadow-none">
            <CardHeader>
              <CardTitle className="text-base">Valores</CardTitle>
            </CardHeader>
            <CardContent>
              <dl className="space-y-4">
                <Field
                  label="Valor bruto"
                  value={money(doc.service_gross_value ?? doc.valor_total)}
                />
                <Field
                  label="Valor líquido"
                  value={money(doc.service_net_value ?? doc.valor_total)}
                />
                <Field
                  label="Descontos"
                  value={money(
                    Number(doc.unconditional_discount_value ?? 0) +
                      Number(doc.conditional_discount_value ?? 0),
                  )}
                />
                <Field label="Retenções" value={money(doc.retentions_value)} />
                <Field label="ISS" value={money(doc.iss_value)} />
              </dl>
            </CardContent>
          </Card>
        </TabsContent>
        <TabsContent value="issuer" className="mt-5">
          <EntityCard title="Prestador do serviço" icon={Building2} entity={issuer} />
        </TabsContent>
        <TabsContent value="recipient" className="mt-5">
          <EntityCard title="Tomador do serviço" icon={UserRound} entity={recipient} />
        </TabsContent>
        <TabsContent value="service" className="mt-5 grid gap-4 lg:grid-cols-3">
          <Card className="border-slate-200 shadow-none lg:col-span-2">
            <CardHeader>
              <CardTitle className="text-base">Descrição do serviço</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="whitespace-pre-wrap text-sm leading-6 text-slate-700">
                {text(service.description ?? doc.service_description)}
              </p>
              {Boolean(service.additionalInformation) && (
                <div className="mt-4 rounded-lg bg-slate-50 p-4 text-xs leading-5 text-slate-600">
                  {text(service.additionalInformation)}
                </div>
              )}
            </CardContent>
          </Card>
          <Card className="border-slate-200 shadow-none">
            <CardHeader>
              <CardTitle className="text-base">Classificação</CardTitle>
            </CardHeader>
            <CardContent>
              <dl className="space-y-4">
                <Field label="Item nacional" value={doc.service_code_national} mono />
                <Field label="Código municipal" value={doc.service_code_municipal} mono />
                <Field label="CNAE" value={doc.cnae_code} mono />
                <Field label="Município de prestação" value={doc.service_municipality_name} />
                <Field label="Município de incidência" value={doc.incidence_municipality_name} />
              </dl>
            </CardContent>
          </Card>
        </TabsContent>
        <TabsContent value="taxes" className="mt-5">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {(
              [
                ["ISS", taxes.iss ?? doc.iss_value],
                ["Base ISS", taxes.issBase ?? doc.iss_base_value],
                ["INSS", taxes.inss],
                ["IR", taxes.ir],
                ["CSLL", taxes.csll],
                ["PIS", taxes.pis],
                ["COFINS", taxes.cofins],
                ["Total retido", taxes.totalRetentions ?? doc.retentions_value],
              ] as Array<[string, unknown]>
            ).map(([label, value]) => (
              <Card key={label} className="border-slate-200 shadow-none">
                <CardContent className="p-4">
                  <p className="text-xs font-medium text-slate-500">{label}</p>
                  <p className="mt-2 text-lg font-semibold tabular-nums text-slate-950">
                    {money(value)}
                  </p>
                </CardContent>
              </Card>
            ))}
          </div>
        </TabsContent>
        <TabsContent value="xml" className="mt-5">
          <Card className="overflow-hidden border-slate-200 shadow-none">
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <CardTitle className="flex items-center gap-2 text-base">
                  <Code2 className="h-4 w-4 text-primary" />
                  XML fiscal
                </CardTitle>
                <p className="mt-1 text-xs text-slate-500">
                  Origem {distribution?.provider || doc.source_provider || "manual"} · processado{" "}
                  {dateTime(doc.last_sync_success_at)}
                </p>
              </div>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={!doc.xml_content}
                  onClick={() => {
                    navigator.clipboard.writeText(doc.xml_content ?? "");
                    toast.success("XML copiado.");
                  }}
                >
                  <Copy className="mr-2 h-4 w-4" />
                  Copiar
                </Button>
                <Button size="sm" disabled={!doc.xml_content} onClick={downloadXml}>
                  <Download className="mr-2 h-4 w-4" />
                  Baixar
                </Button>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              <pre className="max-h-[560px] overflow-auto bg-slate-950 p-5 font-mono text-xs leading-5 text-blue-200">
                {doc.xml_content ? doc.xml_content.replace(/></g, ">\n<") : "XML não disponível."}
              </pre>
            </CardContent>
          </Card>
        </TabsContent>
        <TabsContent value="totvs" className="mt-5 space-y-4">
          <NfseTotvsPanel document={doc} latestRun={latestRun} />
          <Card className="border-slate-200 shadow-none">
            <CardHeader>
              <CardTitle className="text-base">Acompanhamento TOTVS</CardTitle>
            </CardHeader>
            <CardContent>
              <dl className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                <Field label="Status" value={latestRun?.status || "Não iniciada"} />
                <Field label="ID no TOTVS" value={latestRun?.rm_record_id} />
                <Field label="Tentativas" value={latestRun?.attempt ?? 0} />
                <Field
                  label="Última tentativa"
                  value={dateTime(latestRun?.started_at ?? latestRun?.created_at)}
                />
              </dl>
              {latestRun?.error_message && (
                <Alert variant="destructive" className="mt-4">
                  <AlertCircle className="h-4 w-4" />
                  <AlertTitle>Erro da integração</AlertTitle>
                  <AlertDescription>{latestRun.error_message}</AlertDescription>
                </Alert>
              )}
            </CardContent>
          </Card>
        </TabsContent>
        <TabsContent value="history" className="mt-5">
          <Card className="border-slate-200 shadow-none">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <FileClock className="h-4 w-4 text-primary" />
                Histórico do documento
              </CardTitle>
            </CardHeader>
            <CardContent>
              {history.length ? (
                <ol className="space-y-4">
                  {history.map((item) => (
                    <li key={item.id} className="flex gap-3">
                      <div className="mt-0.5 rounded-full bg-emerald-50 p-1.5 text-emerald-700">
                        <CheckCircle2 className="h-3.5 w-3.5" />
                      </div>
                      <div className="min-w-0 flex-1 border-b border-slate-100 pb-4">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <p className="text-sm font-medium capitalize text-slate-900">
                            {item.event_type.replaceAll("_", " ")}
                          </p>
                          <time className="text-xs text-slate-500">
                            {dateTime(item.occurred_at)}
                          </time>
                        </div>
                        <p className="mt-1 text-sm text-slate-600">
                          {item.message || "Ação registrada."}
                        </p>
                      </div>
                    </li>
                  ))}
                </ol>
              ) : (
                <div className="py-10 text-center text-sm text-slate-500">
                  <Clock3 className="mx-auto mb-2 h-6 w-6 text-slate-300" />
                  Nenhum evento adicional registrado. Documento criado em {dateTime(doc.created_at)}
                  .
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
