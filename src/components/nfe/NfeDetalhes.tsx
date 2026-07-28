import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Copy, Download, Mail, XCircle, Clock, ChevronRight, Truck, CreditCard, Info, History, Code, User, Building2, Loader2, Eye, Link2, Unlink } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { NfeItemDrawer } from "./NfeItemDrawer";
import { NfeItemLinkDialog } from "./NfeItemLinkDialog";
import { NfeFinanceiro } from "./NfeFinanceiro";
import { statusConfig, podeEditarApontamentos } from "@/lib/nfe-status";
import { NfeStatusTimeline } from "./NfeStatusTimeline";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getNfeDetails } from "@/lib/fiscal-documents.functions";
import { unlinkNfeItem } from "@/lib/products.functions";
import { generateDanfePdfBlobUrl } from "@/lib/danfe-pdf";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { maskCnpjCpf, maskCep } from "@/lib/br-format";
import { getTotaisIbsCbs } from "@/lib/nfe-ibscbs";


const doc_ = (v: unknown) => {
  const s = String(v ?? "").trim();
  return s ? maskCnpjCpf(s) : "-";
};
const cep_ = (v: unknown) => {
  const s = String(v ?? "").trim();
  return s ? maskCep(s) : "";
};

const fmt = (v: unknown) =>
  Number(v ?? 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

const dt = (v: unknown) => {
  if (!v) return "-";
  const d = new Date(String(v));
  return isNaN(d.getTime()) ? String(v) : d.toLocaleString("pt-BR");
};

const dd = (v: unknown) => {
  if (!v) return "-";
  const d = new Date(String(v));
  return isNaN(d.getTime()) ? String(v) : d.toLocaleDateString("pt-BR");
};

const asArr = <T,>(v: T | T[] | undefined | null): T[] => {
  if (v === undefined || v === null) return [];
  return Array.isArray(v) ? v : [v];
};

const tpNfLabel = (v: unknown) => (String(v) === "0" ? "0 - Entrada" : String(v) === "1" ? "1 - Saída" : String(v ?? "-"));
const finLabel = (v: unknown) => {
  const s = String(v ?? "");
  return ({ "1": "1 - Normal", "2": "2 - Complementar", "3": "3 - Ajuste", "4": "4 - Devolução" }[s] ?? (s || "-"));
};

const TPAG_LABELS: Record<string, string> = {
  "01": "Dinheiro",
  "02": "Cheque",
  "03": "Cartão de Crédito",
  "04": "Cartão de Débito",
  "05": "Crédito Loja",
  "10": "Vale Alimentação",
  "11": "Vale Refeição",
  "12": "Vale Presente",
  "13": "Vale Combustível",
  "14": "Duplicata Mercantil",
  "15": "Boleto Bancário",
  "16": "Depósito Bancário",
  "17": "PIX (Dinâmico)",
  "18": "PIX (Estático) / Carteira Digital",
  "19": "Programa de Fidelidade / Cashback",
  "20": "PIX (Dinâmico)",
  "21": "Transferência bancária / Carteira Digital",
  "22": "Programa de Fidelidade / Cashback",
  "90": "Sem pagamento",
  "99": "Outros",
};

const tPagLabel = (v: unknown) => {
  const raw = String(v ?? "").trim();
  if (!raw) return "-";
  const code = raw.padStart(2, "0");
  const label = TPAG_LABELS[code];
  return label ? `${code} - ${label}` : code;
};

export const NfeDetalhes = ({ nfeId }: { nfeId: string }) => {
  const [selectedItem, setSelectedItem] = useState<any | null>(null);
  const [linkItemId, setLinkItemId] = useState<string | null>(null);
  const [danfePreview, setDanfePreview] = useState<{ url: string; filename: string } | null>(null);
  const fetchFn = useServerFn(getNfeDetails);
  const unlinkFn = useServerFn(unlinkNfeItem);
  const qc = useQueryClient();
  const unlinkMut = useMutation({
    mutationFn: (itemId: string) => unlinkFn({ data: { itemId } }),
    onSuccess: () => {
      toast.success("Vínculo removido");
      qc.invalidateQueries({ queryKey: ["nfe-details", nfeId] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  useEffect(() => {
    return () => {
      if (danfePreview) URL.revokeObjectURL(danfePreview.url);
    };
  }, [danfePreview]);

  const { data, isLoading, error } = useQuery({
    queryKey: ["nfe-details", nfeId],
    queryFn: () => fetchFn({ data: { id: nfeId } }),
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-32 text-slate-500">
        <Loader2 className="h-6 w-6 animate-spin mr-2" /> Carregando NF-e...
      </div>
    );
  }

  if (error) {
    return <div className="p-6 text-destructive">Erro ao carregar: {(error as Error).message}</div>;
  }

  if (!data) {
    return (
      <div className="p-6">
        <p className="text-lg font-medium">NF-e não encontrada.</p>
        <Button variant="outline" className="mt-4" onClick={() => window.history.back()}>Voltar</Button>
      </div>
    );
  }

  const doc = data.document as any;
  const items = data.items as any[];
  const events = data.events as any[];
  const emit = (doc.emitente ?? {}) as any;
  const dest = (doc.destinatario ?? {}) as any;
  const totais = (doc.totais ?? {}) as any;
  const ibscbsTotais = getTotaisIbsCbs(totais, doc.raw_payload, items);
  const transp = (doc.transporte ?? {}) as any;

  const cobr = (doc.cobranca ?? null) as any;
  const pag = (doc.pagamentos ?? null) as any;
  const infAdic = (doc.inf_adicional ?? {}) as any;
  const enderEmit = emit.enderEmit ?? emit.endereco ?? {};
  const enderDest = dest.enderDest ?? {};

  const emitCep = cep_(enderEmit.CEP ?? enderEmit.cep);
  const destCep = cep_(enderDest.CEP ?? enderDest.cep);
  const emitEndereco = [enderEmit.xLgr ?? enderEmit.logradouro, enderEmit.nro ?? enderEmit.numero, enderEmit.xBairro ?? enderEmit.bairro, enderEmit.xMun ?? enderEmit.municipio, enderEmit.UF ?? enderEmit.uf, emitCep ? `CEP ${emitCep}` : null].filter(Boolean).join(", ");
  const destEndereco = [enderDest.xLgr, enderDest.nro, enderDest.xBairro, enderDest.xMun, enderDest.UF, destCep ? `CEP ${destCep}` : null].filter(Boolean).join(", ");

  const vol = asArr<any>(transp.vol)[0] ?? {};
  const dupl = asArr<any>(cobr?.dup);
  const detPag = asArr<any>(pag?.detPag);

  const st = statusConfig(doc.status);

  return (
    <div className="flex flex-col h-full space-y-4 p-6">
      <div className="flex items-center justify-between sticky top-0 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 z-10 p-4 border-b">
        <div className="flex items-center gap-4">
          <Button variant="outline" onClick={() => window.history.back()}>Voltar</Button>
          <div>
            <h1 className="text-xl font-bold">
              NF-e nº {doc.numero ?? "-"} — Série {doc.serie ?? "-"} — Modelo {doc.modelo ?? "55"}
            </h1>
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Badge variant="secondary" className={`border ${st.badge}`}>{st.label}</Badge>
              <span className="font-mono">{doc.chave_acesso}</span>
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6"
                onClick={() => {
                  navigator.clipboard.writeText(doc.chave_acesso ?? "");
                  toast.success("Chave de acesso copiada!");
                }}
              >
                <Copy className="h-3.5 w-3.5" />
              </Button>
            </div>
          </div>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" disabled={!doc.xml_content} onClick={() => {
            if (!doc.xml_content) return;
            const blob = new Blob([doc.xml_content], { type: "text/xml" });
            const url = URL.createObjectURL(blob);
            const a = document.createElement("a");
            a.href = url;
            a.download = `${doc.chave_acesso ?? "nfe"}.xml`;
            a.click();
            URL.revokeObjectURL(url);
          }}>
            <Download className="mr-2 h-4 w-4" /> XML
          </Button>
          <Button variant="outline" size="sm" onClick={() => {
            try {
              const preview = generateDanfePdfBlobUrl(doc, items);
              setDanfePreview(preview);
            } catch (e) {
              toast.error(`Falha ao gerar DANFE: ${e instanceof Error ? e.message : "erro"}`);
            }
          }}><Eye className="mr-2 h-4 w-4" /> DANFE (PDF)</Button>
          <Button variant="outline" size="sm"><Mail className="mr-2 h-4 w-4" /> Reenviar</Button>
          <Button variant="outline" size="sm" className="text-destructive hover:bg-destructive/10"><XCircle className="mr-2 h-4 w-4" /> Cancelar</Button>
          <Button variant="outline" size="sm"><History className="mr-2 h-4 w-4" /> Eventos</Button>
        </div>
      </div>

      <Dialog open={!!danfePreview} onOpenChange={(open) => { if (!open) setDanfePreview(null); }}>
        <DialogContent className="max-w-5xl w-[95vw] h-[90vh] flex flex-col p-0 gap-0">
          <DialogHeader className="p-4 border-b">
            <DialogTitle>Prévia do DANFE</DialogTitle>
          </DialogHeader>
          <div className="flex-1 overflow-hidden bg-muted">
            {danfePreview && (
              <iframe src={danfePreview.url} title="Prévia DANFE" className="w-full h-full border-0" />
            )}
          </div>
          <DialogFooter className="p-4 border-t">
            <Button variant="outline" onClick={() => setDanfePreview(null)}>Fechar</Button>
            <Button onClick={() => {
              if (!danfePreview) return;
              const a = document.createElement("a");
              a.href = danfePreview.url;
              a.download = danfePreview.filename;
              a.click();
            }}>
              <Download className="mr-2 h-4 w-4" /> Baixar PDF
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Tabs defaultValue="resumo" className="flex-1 overflow-hidden flex flex-col">
        <TabsList className="w-full justify-start border-b rounded-none bg-transparent h-auto p-0 mb-4">
          {[
            ["resumo", "Resumo"],
            ["items", "Itens"],
            ["financeiro", "Financeiro"],
            ["impostos", "Impostos"],
            ["transporte", "Transporte"],
            ["cobranca", "Cobrança"],
            ["adicionais", "Adicionais"],
            ["historico", "Histórico"],
            ["xml", "XML"],
          ].map(([v, l]) => (
            <TabsTrigger key={v} value={v} className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent py-3 px-4">
              {l}
            </TabsTrigger>
          ))}
        </TabsList>

        <ScrollArea className="flex-1">
          <div className="space-y-6 pb-10">
            <TabsContent value="resumo" className="m-0 space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <Card className="bg-primary/5 border-primary/20">
                  <CardContent className="p-4">
                    <p className="text-xs text-muted-foreground uppercase font-semibold">Valor Total da Nota</p>
                    <p className="text-2xl font-bold text-primary">{fmt(doc.valor_total)}</p>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="p-4">
                    <p className="text-xs text-muted-foreground uppercase font-semibold">Produtos</p>
                    <p className="text-2xl font-bold">{fmt(doc.valor_produtos ?? totais.vProd)}</p>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="p-4">
                    <p className="text-xs text-muted-foreground uppercase font-semibold">Descontos</p>
                    <p className="text-2xl font-bold text-destructive">{fmt(doc.valor_desconto ?? totais.vDesc)}</p>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="p-4">
                    <p className="text-xs text-muted-foreground uppercase font-semibold">Tributos (Aprox.)</p>
                    <p className="text-2xl font-bold text-amber-600">{fmt(doc.valor_impostos ?? totais.vTotTrib)}</p>
                  </CardContent>
                </Card>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <Card>
                  <CardHeader className="flex flex-row items-center gap-2 py-4">
                    <Info className="h-4 w-4 text-primary" />
                    <CardTitle className="text-lg">Dados de Identificação</CardTitle>
                  </CardHeader>
                  <CardContent className="grid grid-cols-2 gap-y-4 text-sm">
                    <div><p className="text-muted-foreground">Natureza da Operação</p><p className="font-medium">{doc.natureza_operacao ?? "-"}</p></div>
                    <div><p className="text-muted-foreground">Tipo de Operação</p><p className="font-medium">{tpNfLabel(doc.tipo_operacao)}</p></div>
                    <div><p className="text-muted-foreground">Finalidade</p><p className="font-medium">{finLabel(doc.finalidade)}</p></div>
                    <div><p className="text-muted-foreground">Protocolo</p><p className="font-medium">{doc.protocolo ?? "-"}</p></div>
                    <div><p className="text-muted-foreground">Data Emissão</p><p className="font-medium">{dt(doc.data_emissao)}</p></div>
                    <div><p className="text-muted-foreground">Data Autorização</p><p className="font-medium">{dt(doc.data_autorizacao)}</p></div>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="flex flex-row items-center gap-2 py-4">
                    <Building2 className="h-4 w-4 text-primary" />
                    <CardTitle className="text-lg">Emitente</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3 text-sm">
                    <div className="flex justify-between font-bold gap-4">
                      <span>{emit.nome ?? emit.xNome ?? doc.emitente_nome ?? "-"}</span>
                      <span>{doc_(emit.cnpj ?? emit.CNPJ ?? doc.emitente_cnpj)}</span>
                    </div>
                    <p className="text-muted-foreground">{emitEndereco || "-"}</p>
                    <div className="grid grid-cols-2 gap-2">
                      <p><span className="text-muted-foreground">IE:</span> {emit.ie ?? emit.IE ?? "-"}</p>
                      <p><span className="text-muted-foreground">Fantasia:</span> {emit.fantasia ?? emit.xFant ?? "-"}</p>
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="flex flex-row items-center gap-2 py-4">
                    <User className="h-4 w-4 text-primary" />
                    <CardTitle className="text-lg">Destinatário</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3 text-sm">
                    <div className="flex justify-between font-bold gap-4">
                      <span>{dest.xNome ?? doc.destinatario_nome ?? doc.companies?.razao_social ?? "-"}</span>
                      <span>{doc_(dest.CNPJ ?? dest.CPF ?? doc.destinatario_cnpj)}</span>
                    </div>
                    <p className="text-muted-foreground">{destEndereco || "-"}</p>
                    <div className="grid grid-cols-2 gap-2">
                      <p><span className="text-muted-foreground">IE:</span> {dest.IE ?? "-"}</p>
                      <p><span className="text-muted-foreground">Ind. IE Dest.:</span> {dest.indIEDest ?? "-"}</p>
                    </div>
                  </CardContent>
                </Card>
              </div>
            </TabsContent>

            <TabsContent value="items" className="m-0">
              <Card>
                <CardContent className="p-0">
                  <div className="relative overflow-x-auto">
                    <table className="w-full text-sm text-left">
                      <thead className="bg-muted text-xs uppercase text-muted-foreground">
                        <tr>
                          <th className="px-4 py-3">#</th>
                          <th className="px-4 py-3">Código</th>
                          <th className="px-4 py-3">Descrição</th>
                          <th className="px-4 py-3">Vínculo</th>
                          <th className="px-4 py-3">NCM</th>
                          <th className="px-4 py-3">CFOP</th>
                          <th className="px-4 py-3">UN</th>
                          <th className="px-4 py-3 text-right">Qtd</th>
                          <th className="px-4 py-3 text-right">Unitário</th>
                          <th className="px-4 py-3 text-right">Total</th>
                          <th className="px-4 py-3"></th>
                        </tr>
                      </thead>
                      <tbody>
                        {items.length === 0 && (
                          <tr><td colSpan={11} className="text-center py-8 text-muted-foreground">Nenhum item cadastrado.</td></tr>
                        )}
                        {items.map((item) => {
                          const pendente = item.status_vinculo !== "vinculado";
                          return (
                          <tr key={item.id} className={`border-b hover:bg-muted/50 cursor-pointer transition-colors ${pendente ? "bg-amber-50/40" : ""}`} onClick={() => setSelectedItem(item)}>
                            <td className="px-4 py-4 text-xs text-muted-foreground">{item.numero_item}</td>
                            <td className="px-4 py-4 font-mono text-xs">{item.codigo}</td>
                            <td className="px-4 py-4 font-medium">{item.descricao}</td>
                            <td className="px-4 py-4">
                              {pendente ? (
                                <Badge className="bg-amber-100 text-amber-800 border-amber-300 hover:bg-amber-200">Pendente de Vínculo</Badge>
                              ) : (
                                <Badge className="bg-green-100 text-green-800 border-green-300 hover:bg-green-200">Vinculado</Badge>
                              )}
                            </td>
                            <td className="px-4 py-4">{item.ncm ?? "-"}</td>
                            <td className="px-4 py-4">{item.cfop ?? "-"}</td>
                            <td className="px-4 py-4">{item.unidade_comercial ?? "-"}</td>
                            <td className="px-4 py-4 text-right">{Number(item.quantidade_comercial ?? 0).toLocaleString("pt-BR")}</td>
                            <td className="px-4 py-4 text-right">{fmt(item.valor_unitario_comercial)}</td>
                            <td className="px-4 py-4 text-right font-bold">{fmt(item.valor_bruto)}</td>
                            <td className="px-4 py-4 text-right">
                              {pendente ? (
                                <Button size="sm" variant="outline" className="h-8"
                                  onClick={(e) => { e.stopPropagation(); setLinkItemId(item.id); }}>
                                  <Link2 className="h-3.5 w-3.5 mr-1" /> Vincular
                                </Button>
                              ) : (
                                <div className="inline-flex items-center gap-1">
                                  <Button size="sm" variant="ghost" className="h-8 text-amber-700 hover:text-amber-800 hover:bg-amber-50"
                                    disabled={unlinkMut.isPending}
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      if (confirm("Desvincular este item do produto? O item voltará para o status pendente.")) {
                                        unlinkMut.mutate(item.id);
                                      }
                                    }}>
                                    <Unlink className="h-3.5 w-3.5 mr-1" /> Desvincular
                                  </Button>
                                  <ChevronRight className="h-4 w-4 text-muted-foreground" />
                                </div>
                              )}
                            </td>
                          </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="financeiro" className="m-0">
              <NfeFinanceiro doc={doc} items={items} readOnly={!podeEditarApontamentos(doc.status)} />
            </TabsContent>

            <TabsContent value="impostos" className="m-0 space-y-4">

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <Card>
                  <CardHeader className="py-3"><CardTitle className="text-sm uppercase text-muted-foreground">ICMS</CardTitle></CardHeader>
                  <CardContent>
                    <div className="flex justify-between items-end">
                      <div><p className="text-xs text-muted-foreground">BC ICMS</p><p className="font-bold">{fmt(totais.vBC)}</p></div>
                      <div className="text-right"><p className="text-xs text-muted-foreground">Valor ICMS</p><p className="text-xl font-bold text-primary">{fmt(totais.vICMS)}</p></div>
                    </div>
                    <div className="flex justify-between items-end mt-3">
                      <div><p className="text-xs text-muted-foreground">BC ICMS ST</p><p>{fmt(totais.vBCST)}</p></div>
                      <div className="text-right"><p className="text-xs text-muted-foreground">ICMS ST</p><p>{fmt(totais.vST)}</p></div>
                    </div>
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader className="py-3"><CardTitle className="text-sm uppercase text-muted-foreground">IPI</CardTitle></CardHeader>
                  <CardContent>
                    <p className="text-xs text-muted-foreground">Valor IPI</p>
                    <p className="text-xl font-bold text-primary">{fmt(totais.vIPI)}</p>
                    <p className="text-xs text-muted-foreground mt-3">Outros</p>
                    <p>{fmt(totais.vOutro)}</p>
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader className="py-3"><CardTitle className="text-sm uppercase text-muted-foreground">PIS / COFINS</CardTitle></CardHeader>
                  <CardContent className="flex justify-between">
                    <div><p className="text-xs text-muted-foreground">PIS</p><p className="font-bold">{fmt(totais.vPIS)}</p></div>
                    <div className="text-right"><p className="text-xs text-muted-foreground">COFINS</p><p className="font-bold">{fmt(totais.vCOFINS)}</p></div>
                  </CardContent>
                </Card>
              </div>

              {ibscbsTotais.present ? (
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <Card>
                    <CardHeader className="py-3"><CardTitle className="text-sm uppercase text-muted-foreground">IBS</CardTitle></CardHeader>
                    <CardContent>
                      <div className="flex justify-between items-end">
                        <div><p className="text-xs text-muted-foreground">Base IBS/CBS</p><p className="font-bold">{fmt(ibscbsTotais.vBC)}</p></div>
                        <div className="text-right"><p className="text-xs text-muted-foreground">Total IBS</p><p className="text-xl font-bold text-primary">{fmt(ibscbsTotais.vIBS)}</p></div>
                      </div>
                      <div className="flex justify-between items-end mt-3">
                        <div><p className="text-xs text-muted-foreground">IBS UF</p><p>{fmt(ibscbsTotais.vIBSUF)}</p></div>
                        <div className="text-right"><p className="text-xs text-muted-foreground">IBS Município</p><p>{fmt(ibscbsTotais.vIBSMun)}</p></div>
                      </div>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardHeader className="py-3"><CardTitle className="text-sm uppercase text-muted-foreground">CBS</CardTitle></CardHeader>
                    <CardContent>
                      <p className="text-xs text-muted-foreground">Valor CBS</p>
                      <p className="text-xl font-bold text-primary">{fmt(ibscbsTotais.vCBS)}</p>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardHeader className="py-3"><CardTitle className="text-sm uppercase text-muted-foreground">IS (Imposto Seletivo)</CardTitle></CardHeader>
                    <CardContent>
                      <p className="text-xs text-muted-foreground">Valor IS</p>
                      <p className="text-xl font-bold">{fmt(ibscbsTotais.vIS)}</p>
                    </CardContent>
                  </Card>
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">
                  Esta NF-e não possui tributos da Reforma Tributária (IBS / CBS / IS) informados no XML.
                </p>
              )}




            </TabsContent>

            <TabsContent value="transporte" className="m-0 space-y-6">
              <Card>
                <CardHeader className="flex flex-row items-center gap-2">
                  <Truck className="h-4 w-4 text-primary" />
                  <CardTitle>Dados do Transporte</CardTitle>
                </CardHeader>
                <CardContent className="space-y-6">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div>
                      <h4 className="text-xs font-bold uppercase text-muted-foreground mb-3">Modalidade e Transportadora</h4>
                      <div className="space-y-2 text-sm">
                        <p><span className="text-muted-foreground">Frete:</span> {transp.modFrete ?? "-"}</p>
                        <p className="font-bold">{transp.transporta?.xNome ?? "-"}</p>
                        <p>{doc_(transp.transporta?.CNPJ ?? transp.transporta?.CPF)} | IE: {transp.transporta?.IE ?? "-"}</p>
                        <p className="text-muted-foreground text-xs">{transp.transporta?.xEnder ?? ""} {transp.transporta?.xMun ?? ""} {transp.transporta?.UF ?? ""}</p>
                      </div>
                    </div>
                    <div>
                      <h4 className="text-xs font-bold uppercase text-muted-foreground mb-3">Veículo e Volumes</h4>
                      <div className="grid grid-cols-2 gap-4 text-sm">
                        <div><p className="text-muted-foreground">Placa / UF</p><p className="font-medium">{transp.veicTransp?.placa ?? "-"} / {transp.veicTransp?.UF ?? "-"}</p></div>
                        <div><p className="text-muted-foreground">Volumes</p><p className="font-medium">{vol.qVol ?? "-"} {vol.esp ?? ""}</p></div>
                        <div><p className="text-muted-foreground">Peso Líquido</p><p className="font-medium">{vol.pesoL ?? "-"} Kg</p></div>
                        <div><p className="text-muted-foreground">Peso Bruto</p><p className="font-medium">{vol.pesoB ?? "-"} Kg</p></div>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="cobranca" className="m-0 space-y-6">
              <Card>
                <CardHeader className="flex flex-row items-center gap-2">
                  <CreditCard className="h-4 w-4 text-primary" />
                  <CardTitle>Faturas e Duplicatas</CardTitle>
                </CardHeader>
                <CardContent className="space-y-6">
                  {cobr?.fat && (
                    <div className="bg-muted/50 p-4 rounded-lg grid grid-cols-3 gap-4 text-sm">
                      <div><p className="text-muted-foreground">Número Fatura</p><p className="font-bold">{cobr.fat.nFat ?? "-"}</p></div>
                      <div><p className="text-muted-foreground">Valor Original</p><p className="font-bold">{fmt(cobr.fat.vOrig)}</p></div>
                      <div><p className="text-muted-foreground">Valor Líquido</p><p className="font-bold text-primary text-lg">{fmt(cobr.fat.vLiq)}</p></div>
                    </div>
                  )}
                  {dupl.length > 0 ? (
                    <table className="w-full text-sm">
                      <thead className="bg-muted text-xs uppercase text-muted-foreground">
                        <tr>
                          <th className="px-4 py-2 text-left">Parcela</th>
                          <th className="px-4 py-2 text-left">Vencimento</th>
                          <th className="px-4 py-2 text-right">Valor</th>
                        </tr>
                      </thead>
                      <tbody>
                        {dupl.map((d: any, idx: number) => (
                          <tr key={idx} className="border-b">
                            <td className="px-4 py-3">{d.nDup ?? idx + 1}</td>
                            <td className="px-4 py-3 font-medium">{dd(d.dVenc)}</td>
                            <td className="px-4 py-3 text-right font-bold">{fmt(d.vDup)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  ) : (
                    <p className="text-sm text-muted-foreground">Sem duplicatas cadastradas.</p>
                  )}
                  {detPag.length > 0 && (
                    <div>
                      <h4 className="text-xs font-bold uppercase text-muted-foreground mb-2">Pagamentos</h4>
                      <table className="w-full text-sm">
                        <thead className="bg-muted text-xs uppercase text-muted-foreground">
                          <tr>
                            <th className="px-4 py-2 text-left">Forma</th>
                            <th className="px-4 py-2 text-right">Valor</th>
                          </tr>
                        </thead>
                        <tbody>
                          {detPag.map((p: any, i: number) => (
                            <tr key={i} className="border-b">
                              <td className="px-4 py-3">{tPagLabel(p.tPag)}</td>
                              <td className="px-4 py-3 text-right font-bold">{fmt(p.vPag)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="adicionais" className="m-0 space-y-6">
              <Card>
                <CardHeader className="flex flex-row items-center gap-2">
                  <Info className="h-4 w-4 text-primary" />
                  <CardTitle>Informações Adicionais</CardTitle>
                </CardHeader>
                <CardContent className="space-y-6">
                  <div>
                    <h4 className="text-xs font-bold uppercase text-muted-foreground mb-2">Interesse do Contribuinte</h4>
                    <p className="text-sm bg-muted p-4 rounded-md italic text-muted-foreground leading-relaxed whitespace-pre-wrap">
                      {infAdic.infCpl ?? "-"}
                    </p>
                  </div>
                  <div>
                    <h4 className="text-xs font-bold uppercase text-muted-foreground mb-2">Interesse do Fisco</h4>
                    <p className="text-sm bg-muted p-4 rounded-md italic text-muted-foreground leading-relaxed whitespace-pre-wrap">
                      {infAdic.infAdFisco ?? "-"}
                    </p>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="historico" className="m-0 space-y-6">
              <NfeStatusTimeline documentId={doc.id} />
              <Card>
                <CardHeader className="flex flex-row items-center gap-2">
                  <History className="h-4 w-4 text-primary" />
                  <CardTitle>Eventos da NF-e</CardTitle>
                </CardHeader>
                <CardContent>
                  {events.length === 0 ? (
                    <p className="text-sm text-muted-foreground">Sem eventos registrados.</p>
                  ) : (
                    <div className="space-y-4">
                      {events.map((ev: any) => (
                        <div key={ev.id} className="flex gap-3 p-4 rounded border border-muted bg-white shadow-sm">
                          <Clock className="h-5 w-5 text-primary shrink-0 mt-0.5" />
                          <div className="flex-1">
                            <div className="flex items-center justify-between">
                              <div className="font-bold text-slate-900 capitalize">{ev.tipo_evento}</div>
                              <time className="font-mono text-xs font-medium text-primary">{dt(ev.data_evento ?? ev.created_at)}</time>
                            </div>
                            <div className="text-sm text-slate-500">{ev.descricao ?? "-"}</div>
                            {ev.protocolo && <div className="text-xs text-slate-400 mt-1">Protocolo: {ev.protocolo}</div>}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="xml" className="m-0">
              <Card>
                <CardHeader className="flex flex-row items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Code className="h-4 w-4 text-primary" />
                    <CardTitle>Visualizador XML</CardTitle>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={!doc.xml_content}
                    onClick={() => {
                      navigator.clipboard.writeText(doc.xml_content ?? "");
                      toast.success("XML copiado!");
                    }}
                  >
                    <Copy className="h-4 w-4 mr-2" /> Copiar XML
                  </Button>
                </CardHeader>
                <CardContent>
                  <div className="bg-slate-950 p-6 rounded-lg font-mono text-xs text-blue-300 overflow-x-auto max-h-[600px]">
                    <pre className="whitespace-pre-wrap break-all">
                      {doc.xml_content ? doc.xml_content.replace(/></g, ">\n<") : "XML não disponível para esta NF-e."}
                    </pre>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>
          </div>
        </ScrollArea>
      </Tabs>
      <NfeItemDrawer item={selectedItem} open={!!selectedItem} onOpenChange={(open) => !open && setSelectedItem(null)} />
      <NfeItemLinkDialog
        itemId={linkItemId}
        open={!!linkItemId}
        onOpenChange={(open) => !open && setLinkItemId(null)}
        onLinked={() => setLinkItemId(null)}
      />

    </div>
  );
};
