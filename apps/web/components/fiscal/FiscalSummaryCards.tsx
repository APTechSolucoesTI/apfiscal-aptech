import type { LucideIcon } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";

export type FiscalSummaryItem = {
  label: string;
  value: string;
  detail: string;
  icon: LucideIcon;
  tone: string;
};

export function FiscalSummaryCards({
  items,
  label,
}: {
  items: FiscalSummaryItem[];
  label: string;
}) {
  return (
    <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4" aria-label={label}>
      {items.map((item) => (
        <Card key={item.label} className="border-slate-200 shadow-none">
          <CardContent className="flex items-start gap-3 p-4">
            <div className={`rounded-lg p-2 ${item.tone}`}>
              <item.icon className="h-4 w-4" aria-hidden="true" />
            </div>
            <div>
              <p className="text-xs font-medium text-slate-500">{item.label}</p>
              <p className="mt-1 text-xl font-semibold tabular-nums text-slate-950">{item.value}</p>
              <p className="mt-0.5 text-[11px] text-slate-500">{item.detail}</p>
            </div>
          </CardContent>
        </Card>
      ))}
    </section>
  );
}

