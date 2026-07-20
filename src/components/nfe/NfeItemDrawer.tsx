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

interface NfeItem {
  id: string;
  cod: string;
  desc: string;
  ncm: string;
  cest?: string;
  cfop: string;
  unidade: string;
  qtd: number;
  valorUnit: number;
  total: number;
  desconto: number;
  impostos: {
    icms: {
      cst: string;
      origem: string;
      modalidadeBc: string;
      valorBc: number;
      aliquota: number;
      valor: number;
    };
    ipi?: {
      cst: string;
      valorBc: number;
      aliquota: number;
      valor: number;
    };
    pis: {
      cst: string;
      valorBc: number;
      aliquota: number;
      valor: number;
    };
    cofins: {
      cst: string;
      valorBc: number;
      aliquota: number;
      valor: number;
    };
  };
  infAdProd?: string;
}

interface NfeItemDrawerProps {
  item: NfeItem | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export const NfeItemDrawer = ({ item, open, onOpenChange }: NfeItemDrawerProps) => {
  if (!item) return null;

  const formatCurrency = (value: number) =>
    new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="sm:max-w-xl w-[90vw] p-0">
        <SheetHeader className="p-6 border-b">
          <div className="flex justify-between items-start">
            <div>
              <SheetTitle className="text-xl font-bold">{item.desc}</SheetTitle>
              <SheetDescription>Código: {item.cod}</SheetDescription>
            </div>
          </div>
        </SheetHeader>
        <ScrollArea className="h-[calc(100vh-140px)]">
          <div className="p-6 space-y-8 pb-10">
            {/* Dados Gerais do Item */}
            <section>
              <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground mb-4">Dados Gerais</h3>
              <div className="grid grid-cols-2 gap-y-4 gap-x-6">
                <div>
                  <p className="text-xs text-muted-foreground">NCM</p>
                  <p className="text-sm font-medium">{item.ncm}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">CFOP</p>
                  <p className="text-sm font-medium">{item.cfop}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Unidade</p>
                  <p className="text-sm font-medium">{item.unidade}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Quantidade</p>
                  <p className="text-sm font-medium">{item.qtd}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Valor Unitário</p>
                  <p className="text-sm font-medium">{formatCurrency(item.valorUnit)}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Valor Total</p>
                  <p className="text-sm font-bold text-primary">{formatCurrency(item.total)}</p>
                </div>
              </div>
            </section>

            <Separator />

            {/* Impostos do Item */}
            <section className="space-y-6">
              <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground mb-4">Impostos do Item</h3>
              
              <Card className="bg-muted/30 border-none shadow-none">
                <CardContent className="p-4 space-y-4">
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-sm">ICMS</span>
                    <Badge variant="outline">{item.impostos.icms.cst}</Badge>
                  </div>
                  <div className="grid grid-cols-2 gap-4 text-sm">
                    <div>
                      <p className="text-xs text-muted-foreground">Base de Cálculo</p>
                      <p>{formatCurrency(item.impostos.icms.valorBc)}</p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Alíquota</p>
                      <p>{item.impostos.icms.aliquota}%</p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Valor ICMS</p>
                      <p className="font-medium">{formatCurrency(item.impostos.icms.valor)}</p>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <div className="grid grid-cols-2 gap-4">
                <Card className="bg-muted/30 border-none shadow-none">
                  <CardContent className="p-4 space-y-3">
                    <span className="font-semibold text-sm">PIS</span>
                    <div className="text-xs space-y-1">
                      <div className="flex justify-between"><span className="text-muted-foreground">Alíquota:</span> <span>{item.impostos.pis.aliquota}%</span></div>
                      <div className="flex justify-between font-medium"><span className="text-muted-foreground">Valor:</span> <span>{formatCurrency(item.impostos.pis.valor)}</span></div>
                    </div>
                  </CardContent>
                </Card>
                <Card className="bg-muted/30 border-none shadow-none">
                  <CardContent className="p-4 space-y-3">
                    <span className="font-semibold text-sm">COFINS</span>
                    <div className="text-xs space-y-1">
                      <div className="flex justify-between"><span className="text-muted-foreground">Alíquota:</span> <span>{item.impostos.cofins.aliquota}%</span></div>
                      <div className="flex justify-between font-medium"><span className="text-muted-foreground">Valor:</span> <span>{formatCurrency(item.impostos.cofins.valor)}</span></div>
                    </div>
                  </CardContent>
                </Card>
              </div>
            </section>

            {item.infAdProd && (
              <>
                <Separator />
                <section>
                  <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground mb-4">Informações Adicionais</h3>
                  <p className="text-sm text-muted-foreground bg-muted p-3 rounded-md italic">
                    {item.infAdProd}
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
