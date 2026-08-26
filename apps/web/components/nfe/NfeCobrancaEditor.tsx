"use client";

import { useMemo, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { CalendarPlus, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useServerFn } from "@/lib/api-action";
import { setCobrancaManual } from "@/lib/client-actions";

type Installment = { numero: string; vencimento: string; valor: string };

export function NfeCobrancaEditor({
  documentId,
  total,
  disabled,
}: {
  documentId: string;
  total: number;
  disabled: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [rows, setRows] = useState<Installment[]>([
    { numero: "001", vencimento: "", valor: total.toFixed(2) },
  ]);
  const save = useServerFn(setCobrancaManual);
  const queryClient = useQueryClient();
  const sum = useMemo(() => rows.reduce((value, row) => value + Number(row.valor || 0), 0), [rows]);
  const mutation = useMutation({
    mutationFn: () =>
      save({
        data: {
          documentId,
          parcelas: rows.map((row) => ({
            numero: row.numero,
            vencimento: row.vencimento,
            valor: Number(row.valor),
          })),
        },
      }),
    onSuccess: () => {
      toast.success("Cobrança salva e pronta para gerar o financeiro no TOTVS.");
      queryClient.invalidateQueries({ queryKey: ["nfe-details", documentId] });
      setOpen(false);
    },
    onError: (error: Error) => toast.error(error.message),
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" disabled={disabled}>
          <CalendarPlus className="mr-2 h-4 w-4" /> Definir cobrança
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Faturas e duplicatas</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          {rows.map((row, index) => (
            <div
              key={index}
              className="grid grid-cols-[110px_1fr_1fr_40px] items-end gap-3 rounded-lg border p-3"
            >
              <div className="space-y-1">
                <Label>Parcela</Label>
                <Input
                  value={row.numero}
                  onChange={(event) =>
                    setRows((current) =>
                      current.map((item, itemIndex) =>
                        itemIndex === index ? { ...item, numero: event.target.value } : item,
                      ),
                    )
                  }
                />
              </div>
              <div className="space-y-1">
                <Label>Vencimento</Label>
                <Input
                  type="date"
                  value={row.vencimento}
                  onChange={(event) =>
                    setRows((current) =>
                      current.map((item, itemIndex) =>
                        itemIndex === index ? { ...item, vencimento: event.target.value } : item,
                      ),
                    )
                  }
                />
              </div>
              <div className="space-y-1">
                <Label>Valor</Label>
                <Input
                  type="number"
                  min="0.01"
                  step="0.01"
                  value={row.valor}
                  onChange={(event) =>
                    setRows((current) =>
                      current.map((item, itemIndex) =>
                        itemIndex === index ? { ...item, valor: event.target.value } : item,
                      ),
                    )
                  }
                />
              </div>
              <Button
                variant="ghost"
                size="icon"
                aria-label={`Excluir parcela ${index + 1}`}
                disabled={rows.length === 1}
                onClick={() =>
                  setRows((current) => current.filter((_, itemIndex) => itemIndex !== index))
                }
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          ))}
          <div className="flex items-center justify-between">
            <Button
              variant="outline"
              size="sm"
              onClick={() =>
                setRows((current) => [
                  ...current,
                  {
                    numero: String(current.length + 1).padStart(3, "0"),
                    vencimento: "",
                    valor: "",
                  },
                ])
              }
            >
              <Plus className="mr-2 h-4 w-4" /> Adicionar parcela
            </Button>
            <p
              className={
                Math.abs(sum - total) <= 0.01
                  ? "text-sm font-semibold text-emerald-700"
                  : "text-sm font-semibold text-amber-700"
              }
            >
              Total das parcelas:{" "}
              {sum.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })} /{" "}
              {total.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}
            </p>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            Cancelar
          </Button>
          <Button
            disabled={
              mutation.isPending ||
              rows.some((row) => !row.vencimento) ||
              Math.abs(sum - total) > 0.01
            }
            onClick={() => mutation.mutate()}
          >
            {mutation.isPending ? "Salvando..." : "Salvar cobrança"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
