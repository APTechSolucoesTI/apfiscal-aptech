import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Separator } from "@/components/ui/separator";
import { GripVertical, Settings2, RotateCcw } from "lucide-react";
import type { ColumnDef } from "@/hooks/use-column-preferences";

type Props = {
  columns: ColumnDef[]; // ordered (current order)
  isVisible: (key: string) => boolean;
  toggleVisible: (key: string) => void;
  moveColumn: (fromKey: string, toKey: string) => void;
  reset: () => void;
  label?: string;
};

export function ColumnSettings({ columns, isVisible, toggleVisible, moveColumn, reset, label = "Colunas" }: Props) {
  const [dragKey, setDragKey] = useState<string | null>(null);
  const [overKey, setOverKey] = useState<string | null>(null);

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" className="gap-2">
          <Settings2 className="h-4 w-4" />
          {label}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-72 p-0" align="end">
        <div className="px-3 py-2 flex items-center justify-between">
          <span className="text-sm font-semibold">Colunas visíveis</span>
          <Button variant="ghost" size="sm" onClick={reset} className="h-7 gap-1 text-xs">
            <RotateCcw className="h-3 w-3" /> Padrão
          </Button>
        </div>
        <Separator />
        <div className="max-h-80 overflow-y-auto py-1">
          {columns.map((col) => {
            const visible = isVisible(col.key);
            const isOver = overKey === col.key && dragKey && dragKey !== col.key;
            return (
              <div
                key={col.key}
                draggable
                onDragStart={() => setDragKey(col.key)}
                onDragEnd={() => { setDragKey(null); setOverKey(null); }}
                onDragOver={(e) => { e.preventDefault(); setOverKey(col.key); }}
                onDrop={(e) => {
                  e.preventDefault();
                  if (dragKey && dragKey !== col.key) moveColumn(dragKey, col.key);
                  setDragKey(null);
                  setOverKey(null);
                }}
                className={`flex items-center gap-2 px-3 py-1.5 text-sm cursor-move hover:bg-slate-50 ${isOver ? "bg-blue-50" : ""}`}
              >
                <GripVertical className="h-4 w-4 text-slate-400 shrink-0" />
                <Checkbox
                  checked={visible}
                  disabled={col.alwaysVisible}
                  onCheckedChange={() => toggleVisible(col.key)}
                  aria-label={`Exibir coluna ${col.label}`}
                />
                <span className={`flex-1 truncate ${!visible ? "text-slate-400" : ""}`}>{col.label}</span>
                {col.alwaysVisible && <span className="text-[10px] text-slate-400">fixa</span>}
              </div>
            );
          })}
        </div>
        <Separator />
        <div className="px-3 py-2 text-[11px] text-slate-500">Arraste para reordenar. Preferências salvas neste navegador.</div>
      </PopoverContent>
    </Popover>
  );
}
