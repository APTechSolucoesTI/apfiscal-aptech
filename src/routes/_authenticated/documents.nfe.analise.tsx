import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Loader2, Download, Table2 } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/documents/nfe/analise")({
  component: TabelaDinamicaNfe,
  head: () => ({
    meta: [
      { title: "Tabela Dinâmica de NF-e | APFiscal" },
      {
        name: "description",
        content:
          "Cruze dados das NF-e por empresa, fornecedor, produto, CFOP, plano de contas e período em uma tabela dinâmica.",
      },
      { property: "og:title", content: "Tabela Dinâmica de NF-e | APFiscal" },
      {
        property: "og:description",
        content: "Análise cruzada de notas fiscais eletrônicas no APFiscal.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
});

type ItemRow = {
  id: string;
  descricao: string | null;
  ncm: string | null;
  cfop: string | null;
  unidade_comercial: string | null;
  quantidade_comercial: number | null;
  valor_total: number | null;
  valor_bruto: number | null;
  status_vinculo: string | null;
  produtos: { codigo_interno: string; descricao: string } | null;
  plano_contas: { codigo: string; descricao: string } | null;
  locais_estoque: { codigo: string; descricao: string } | null;
  tipos_compra: { codigo: string; descricao: string } | null;
  fiscal_documents: {
    numero: string | null;
    emitente_nome: string | null;
    emitente_cnpj: string | null;
    data_emissao: string | null;
    status: string | null;
    natureza_operacao: string | null;
    companies: { razao_social: string | null; nome_fantasia: string | null } | null;
  } | null;
};

type Registro = Record<string, string | number> & { __valor: number; __qtd: number };

const DIMENSOES = [
  { key: "empresa", label: "Empresa" },
  { key: "fornecedor", label: "Fornecedor (Emitente)" },
  { key: "cnpj", label: "CNPJ Emitente" },
  { key: "ano", label: "Ano" },
  { key: "mes", label: "Mês" },
  { key: "status", label: "Status da NF-e" },
  { key: "natureza", label: "Natureza da Operação" },
  { key: "cfop", label: "CFOP" },
  { key: "ncm", label: "NCM" },
  { key: "produto", label: "Produto vinculado" },
  { key: "descricao_item", label: "Descrição do item" },
  { key: "unidade", label: "Unidade" },
  { key: "plano_contas", label: "Plano de Contas" },
  { key: "centro_local", label: "Local de Estoque" },
  { key: "tipo_compra", label: "Tipo de Compra" },
  { key: "vinculo", label: "Situação do vínculo" },
] as const;

const MEDIDAS = [
  { key: "valor", label: "Valor total (R$)" },
  { key: "quantidade", label: "Quantidade" },
  { key: "itens", label: "Qtd. de itens" },
] as const;

const STATUS_LABEL: Record<string, string> = {
  pendente_confirmacao: "Pendente de Confirmação",
  aprovada: "Aprovada",
  pronta_para_integracao: "Pronta para Integração",
  integrado_totvs: "Integrado na TOTVS",
};

const MESES = [
  "Jan", "Fev", "Mar", "Abr", "Mai", "Jun",
  "Jul", "Ago", "Set", "Out", "Nov", "Dez",
];

const SEM = "(não informado)";

function brl(n: number) {
  return n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}
function num(n: number) {
  return n.toLocaleString("pt-BR", { maximumFractionDigits: 3 });
}

function TabelaDinamicaNfe() {
  const [linha, setLinha] = useState<string>("fornecedor");
  const [coluna, setColuna] = useState<string>("mes");
  const [medida, setMedida] = useState<string>("valor");

  const { data: itens = [], isLoading } = useQuery({
    queryKey: ["pivot-nfe-itens"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("fiscal_document_items")
        .select(
          "id, descricao, ncm, cfop, unidade_comercial, quantidade_comercial, valor_total, valor_bruto, status_vinculo, produtos:product_id(codigo_interno, descricao), plano_contas:plano_contas_id(codigo, descricao), locais_estoque:local_estoque_id(codigo, descricao), tipos_compra:tipo_compra_id(codigo, descricao), fiscal_documents!inner(numero, emitente_nome, emitente_cnpj, data_emissao, status, natureza_operacao, companies(razao_social, nome_fantasia))",
        )
        .limit(20000);
      if (error) throw error;
      return (data ?? []) as unknown as ItemRow[];
    },
  });

  const registros: Registro[] = useMemo(() => {
    return itens.map((i) => {
      const doc = i.fiscal_documents;
      const d = doc?.data_emissao ? new Date(doc.data_emissao) : null;
      const valor = Number(i.valor_total ?? i.valor_bruto ?? 0);
      return {
        empresa:
          doc?.companies?.nome_fantasia || doc?.companies?.razao_social || SEM,
        fornecedor: doc?.emitente_nome || doc?.emitente_cnpj || SEM,
        cnpj: doc?.emitente_cnpj || SEM,
        ano: d ? String(d.getFullYear()) : SEM,
        mes: d ? `${MESES[d.getMonth()]}/${d.getFullYear()}` : SEM,
        status: doc?.status ? STATUS_LABEL[doc.status] ?? doc.status : SEM,
        natureza: doc?.natureza_operacao || SEM,
        cfop: i.cfop || SEM,
        ncm: i.ncm || SEM,
        produto: i.produtos
          ? `${i.produtos.codigo_interno} - ${i.produtos.descricao}`
          : "(não vinculado)",
        descricao_item: i.descricao || SEM,
        unidade: i.unidade_comercial || SEM,
        plano_contas: i.plano_contas
          ? `${i.plano_contas.codigo} - ${i.plano_contas.descricao}`
          : SEM,
        centro_local: i.locais_estoque
          ? `${i.locais_estoque.codigo} - ${i.locais_estoque.descricao}`
          : SEM,
        tipo_compra: i.tipos_compra
          ? `${i.tipos_compra.codigo} - ${i.tipos_compra.descricao}`
          : SEM,
        vinculo: i.status_vinculo === "vinculado" ? "Vinculado" : "Pendente",
        __valor: valor,
        __qtd: Number(i.quantidade_comercial ?? 0),
      } satisfies Registro;
    });
  }, [itens]);

  const pivot = useMemo(() => {
    const colunas = new Set<string>();
    const linhas = new Map<string, Map<string, number>>();
    const totalLinha = new Map<string, number>();
    const totalColuna = new Map<string, number>();
    let total = 0;

    const valorDe = (r: Registro) =>
      medida === "valor" ? r.__valor : medida === "quantidade" ? r.__qtd : 1;

    for (const r of registros) {
      const l = String(r[linha] ?? SEM);
      const c = coluna === "__none" ? "Total" : String(r[coluna] ?? SEM);
      const v = valorDe(r);
      colunas.add(c);
      if (!linhas.has(l)) linhas.set(l, new Map());
      const m = linhas.get(l)!;
      m.set(c, (m.get(c) ?? 0) + v);
      totalLinha.set(l, (totalLinha.get(l) ?? 0) + v);
      totalColuna.set(c, (totalColuna.get(c) ?? 0) + v);
      total += v;
    }

    const ordenarColunas = (a: string, b: string) => {
      if (coluna === "mes") {
        const pa = a.split("/");
        const pb = b.split("/");
        const ia = Number(pa[1]) * 100 + MESES.indexOf(pa[0] ?? "");
        const ib = Number(pb[1]) * 100 + MESES.indexOf(pb[0] ?? "");
        if (!Number.isNaN(ia) && !Number.isNaN(ib)) return ia - ib;
      }
      return a.localeCompare(b, "pt-BR");
    };

    return {
      colunas: Array.from(colunas).sort(ordenarColunas),
      linhas: Array.from(linhas.keys()).sort(
        (a, b) => (totalLinha.get(b) ?? 0) - (totalLinha.get(a) ?? 0),
      ),
      celulas: linhas,
      totalLinha,
      totalColuna,
      total,
    };
  }, [registros, linha, coluna, medida]);

  const fmt = medida === "valor" ? brl : num;

  function exportarCsv() {
    if (pivot.linhas.length === 0) {
      toast.error("Nada para exportar.");
      return;
    }
    const sep = ";";
    const head = [
      DIMENSOES.find((d) => d.key === linha)?.label ?? "",
      ...pivot.colunas,
      "Total",
    ];
    const linhasCsv = pivot.linhas.map((l) => [
      l,
      ...pivot.colunas.map((c) => String(pivot.celulas.get(l)?.get(c) ?? 0).replace(".", ",")),
      String(pivot.totalLinha.get(l) ?? 0).replace(".", ","),
    ]);
    const csv = [head, ...linhasCsv]
      .map((r) => r.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(sep))
      .join("\n");
    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "tabela-dinamica-nfe.csv";
    a.click();
    URL.revokeObjectURL(url);
    toast.success("CSV exportado.");
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
            <Table2 className="h-6 w-6 text-blue-600" /> Tabela Dinâmica de NF-e
          </h1>
          <p className="text-slate-500">
            Cruze os dados dos itens das notas fiscais por qualquer combinação de
            dimensões.
          </p>
        </div>
        <Button variant="outline" onClick={exportarCsv}>
          <Download className="mr-2 h-4 w-4" /> Exportar CSV
        </Button>
      </div>

      <Card className="border-slate-200">
        <CardHeader>
          <CardTitle className="text-base">Configuração do cruzamento</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-3">
          <div className="space-y-1.5">
            <Label>Linhas</Label>
            <Select value={linha} onValueChange={setLinha}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {DIMENSOES.map((d) => (
                  <SelectItem key={d.key} value={d.key}>{d.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Colunas</Label>
            <Select value={coluna} onValueChange={setColuna}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__none">(sem colunas)</SelectItem>
                {DIMENSOES.map((d) => (
                  <SelectItem key={d.key} value={d.key}>{d.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Medida</Label>
            <Select value={medida} onValueChange={setMedida}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {MEDIDAS.map((m) => (
                  <SelectItem key={m.key} value={m.key}>{m.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      <Card className="border-slate-200">
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-base">Resultado</CardTitle>
          <div className="flex gap-2">
            <Badge variant="secondary">{registros.length} itens analisados</Badge>
            <Badge variant="secondary">{pivot.linhas.length} linhas</Badge>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex justify-center py-16">
              <Loader2 className="h-6 w-6 animate-spin text-slate-400" />
            </div>
          ) : pivot.linhas.length === 0 ? (
            <div className="text-center py-16 text-slate-500">
              Nenhum dado de NF-e disponível para análise.
            </div>
          ) : (
            <div className="overflow-auto max-h-[65vh] rounded border">
              <Table>
                <TableHeader className="sticky top-0 z-10 bg-slate-50">
                  <TableRow>
                    <TableHead className="sticky left-0 bg-slate-50 min-w-[240px]">
                      {DIMENSOES.find((d) => d.key === linha)?.label}
                    </TableHead>
                    {pivot.colunas.map((c) => (
                      <TableHead key={c} className="text-right whitespace-nowrap">
                        {c}
                      </TableHead>
                    ))}
                    <TableHead className="text-right font-bold whitespace-nowrap">
                      Total
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {pivot.linhas.map((l) => (
                    <TableRow key={l}>
                      <TableCell className="sticky left-0 bg-background font-medium max-w-[320px] truncate" title={l}>
                        {l}
                      </TableCell>
                      {pivot.colunas.map((c) => {
                        const v = pivot.celulas.get(l)?.get(c) ?? 0;
                        return (
                          <TableCell key={c} className="text-right tabular-nums">
                            {v ? fmt(v) : <span className="text-slate-300">-</span>}
                          </TableCell>
                        );
                      })}
                      <TableCell className="text-right font-semibold tabular-nums">
                        {fmt(pivot.totalLinha.get(l) ?? 0)}
                      </TableCell>
                    </TableRow>
                  ))}
                  <TableRow className="bg-slate-50 font-bold">
                    <TableCell className="sticky left-0 bg-slate-50">Total geral</TableCell>
                    {pivot.colunas.map((c) => (
                      <TableCell key={c} className="text-right tabular-nums">
                        {fmt(pivot.totalColuna.get(c) ?? 0)}
                      </TableCell>
                    ))}
                    <TableCell className="text-right tabular-nums">{fmt(pivot.total)}</TableCell>
                  </TableRow>
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
