import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Card, CardContent } from "@/components/ui/card";
import { getItemIbsCbs } from "@/lib/nfe-ibscbs";


interface NfeItemDrawerProps {
  item: any | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const fmt = (v: unknown) =>
  Number(v ?? 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

// Find the first non-empty tax block regardless of CST/CSOSN subtag names
function pickTax(node: any) {
  if (!node || typeof node !== "object") return null;
  for (const k of Object.keys(node)) {
    const v = node[k];
    if (v && typeof v === "object") return v;
  }
  return null;
}

export const NfeItemDrawer = ({ item, open, onOpenChange }: NfeItemDrawerProps) => {
  if (!item) return null;

  const impostos = item.impostos ?? {};
  const icms = pickTax(impostos.ICMS) ?? {};
  const ipi = pickTax(impostos.IPI) ?? {};
  const pis = pickTax(impostos.PIS) ?? {};
  const cofins = pickTax(impostos.COFINS) ?? {};

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="sm:max-w-xl w-[90vw] p-0">
        <SheetHeader className="p-6 border-b">
          <div className="flex justify-between items-start">
            <div>
              <SheetTitle className="text-xl font-bold">{item.descricao ?? "-"}</SheetTitle>
              <SheetDescription>Código: {item.codigo ?? "-"} · Item {item.numero_item}</SheetDescription>
            </div>
          </div>
        </SheetHeader>
        <ScrollArea className="h-[calc(100vh-140px)]">
          <div className="p-6 space-y-8 pb-10">
            <section>
              <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground mb-4">Dados Gerais</h3>
              <div className="grid grid-cols-2 gap-y-4 gap-x-6">
                <div><p className="text-xs text-muted-foreground">NCM</p><p className="text-sm font-medium">{item.ncm ?? "-"}</p></div>
                <div><p className="text-xs text-muted-foreground">CEST</p><p className="text-sm font-medium">{item.cest ?? "-"}</p></div>
                <div><p className="text-xs text-muted-foreground">CFOP</p><p className="text-sm font-medium">{item.cfop ?? "-"}</p></div>
                <div><p className="text-xs text-muted-foreground">Unidade</p><p className="text-sm font-medium">{item.unidade_comercial ?? "-"}</p></div>
                <div><p className="text-xs text-muted-foreground">Quantidade</p><p className="text-sm font-medium">{Number(item.quantidade_comercial ?? 0).toLocaleString("pt-BR")}</p></div>
                <div><p className="text-xs text-muted-foreground">Valor Unitário</p><p className="text-sm font-medium">{fmt(item.valor_unitario_comercial)}</p></div>
                <div><p className="text-xs text-muted-foreground">Valor Bruto</p><p className="text-sm font-bold text-primary">{fmt(item.valor_bruto)}</p></div>
                <div><p className="text-xs text-muted-foreground">Desconto</p><p className="text-sm font-medium">{fmt(item.valor_desconto)}</p></div>
                <div><p className="text-xs text-muted-foreground">Frete</p><p className="text-sm font-medium">{fmt(item.valor_frete)}</p></div>
                <div><p className="text-xs text-muted-foreground">EAN</p><p className="text-sm font-medium">{item.ean ?? "-"}</p></div>
              </div>
            </section>

            <Separator />

            <section className="space-y-6">
              <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground mb-4">Impostos do Item</h3>

              <Card className="bg-muted/30 border-none shadow-none">
                <CardContent className="p-4 space-y-4">
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-sm">ICMS</span>
                    {icms.CST && <Badge variant="outline">CST {icms.CST}</Badge>}
                    {icms.CSOSN && <Badge variant="outline">CSOSN {icms.CSOSN}</Badge>}
                  </div>
                  <div className="grid grid-cols-2 gap-4 text-sm">
                    <div><p className="text-xs text-muted-foreground">Origem</p><p>{icms.orig ?? "-"}</p></div>
                    <div><p className="text-xs text-muted-foreground">Base de Cálculo</p><p>{fmt(icms.vBC)}</p></div>
                    <div><p className="text-xs text-muted-foreground">Alíquota</p><p>{icms.pICMS ?? "-"}%</p></div>
                    <div><p className="text-xs text-muted-foreground">Valor ICMS</p><p className="font-medium">{fmt(icms.vICMS)}</p></div>
                  </div>
                </CardContent>
              </Card>

              <div className="grid grid-cols-2 gap-4">
                <Card className="bg-muted/30 border-none shadow-none">
                  <CardContent className="p-4 space-y-3">
                    <span className="font-semibold text-sm">PIS</span>
                    <div className="text-xs space-y-1">
                      <div className="flex justify-between"><span className="text-muted-foreground">CST:</span> <span>{pis.CST ?? "-"}</span></div>
                      <div className="flex justify-between"><span className="text-muted-foreground">Alíquota:</span> <span>{pis.pPIS ?? "-"}%</span></div>
                      <div className="flex justify-between font-medium"><span className="text-muted-foreground">Valor:</span> <span>{fmt(pis.vPIS)}</span></div>
                    </div>
                  </CardContent>
                </Card>
                <Card className="bg-muted/30 border-none shadow-none">
                  <CardContent className="p-4 space-y-3">
                    <span className="font-semibold text-sm">COFINS</span>
                    <div className="text-xs space-y-1">
                      <div className="flex justify-between"><span className="text-muted-foreground">CST:</span> <span>{cofins.CST ?? "-"}</span></div>
                      <div className="flex justify-between"><span className="text-muted-foreground">Alíquota:</span> <span>{cofins.pCOFINS ?? "-"}%</span></div>
                      <div className="flex justify-between font-medium"><span className="text-muted-foreground">Valor:</span> <span>{fmt(cofins.vCOFINS)}</span></div>
                    </div>
                  </CardContent>
                </Card>
                {(ipi.vIPI || ipi.pIPI) && (
                  <Card className="bg-muted/30 border-none shadow-none col-span-2">
                    <CardContent className="p-4 space-y-3">
                      <span className="font-semibold text-sm">IPI</span>
                      <div className="text-xs grid grid-cols-3 gap-2">
                        <div><span className="text-muted-foreground">CST:</span> {ipi.CST ?? "-"}</div>
                        <div><span className="text-muted-foreground">Alíquota:</span> {ipi.pIPI ?? "-"}%</div>
                        <div className="font-medium"><span className="text-muted-foreground">Valor:</span> {fmt(ipi.vIPI)}</div>
                      </div>
                    </CardContent>
                  </Card>
                )}
              </div>
            </section>

            {item.inf_adicional && (
              <>
                <Separator />
                <section>
                  <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground mb-4">Informações Adicionais</h3>
                  <p className="text-sm text-muted-foreground bg-muted p-3 rounded-md italic whitespace-pre-wrap">
                    {item.inf_adicional}
                  </p>
                </section>
              </>
            )}
          </div>
        </ScrollArea>
      </SheetContent>
    </Sheet>
  );
};
