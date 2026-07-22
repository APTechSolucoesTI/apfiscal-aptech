import { useEffect, useMemo, useRef, useState } from "react";
import * as XLSX from "xlsx";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Progress } from "@/components/ui/progress";
import { Upload, FileSpreadsheet, Loader2, Sparkles, CheckCircle2, AlertCircle, Globe2, Building2 } from "lucide-react";
import { toast } from "sonner";

export type ImportField = {
  key: string;
  label: string;
  required?: boolean;
  aliases?: string[]; // normalized candidate names for auto-mapping
  transform?: (value: unknown) => unknown;
};

export type ImportCompanyOption = { id: string; label: string };

export type ImportContext = { companyId: string | null };

export type ImportXlsxDialogProps<T> = {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  title: string;
  description?: string;
  fields: ImportField[];
  buildRow: (mapped: Record<string, unknown>, ctx: ImportContext) => T | null;
  onImportRow: (row: T, index: number) => Promise<void>;
  onDone?: () => void;
  /** List of companies available for scoping the import. */
  companies?: ImportCompanyOption[];
  /** When true, allows the "Global (todas as empresas)" option to be selected. */
  allowGlobal?: boolean;
  /** When true, the import cannot start until the user picks a company (or global if allowed). */
  requireCompanySelection?: boolean;
  /** Optional async duplicate check per built row. When it returns true, the row is skipped. */
  checkDuplicate?: (row: T, ctx: ImportContext) => Promise<boolean>;
};

const normalize = (s: string) =>
  s.toString().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "");

const NONE = "__none__";
const GLOBAL = "__global__";
const UNSET = "__unset__";

function autoMap(headers: string[], fields: ImportField[]): Record<string, string> {
  const map: Record<string, string> = {};
  const normHeaders = headers.map((h) => ({ raw: h, norm: normalize(h) }));
  for (const f of fields) {
    const candidates = [f.key, f.label, ...(f.aliases ?? [])].map(normalize);
    const hit = normHeaders.find((h) => candidates.some((c) => c && (h.norm === c || h.norm.includes(c) || c.includes(h.norm))));
    if (hit) map[f.key] = hit.raw;
  }
  return map;
}

export function ImportXlsxDialog<T>({
  open, onOpenChange, title, description, fields, buildRow, onImportRow, onDone,
  companies, allowGlobal, requireCompanySelection, checkDuplicate,
}: ImportXlsxDialogProps<T>) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [fileName, setFileName] = useState<string>("");
  const [headers, setHeaders] = useState<string[]>([]);
  const [rows, setRows] = useState<Record<string, unknown>[]>([]);
  const [mapping, setMapping] = useState<Record<string, string>>({});
  const [importing, setImporting] = useState(false);
  const [progress, setProgress] = useState(0);
  const [result, setResult] = useState<{ ok: number; fail: number; skipped: number; errors: string[] } | null>(null);
  const [scopeValue, setScopeValue] = useState<string>(UNSET);

  const showScope = !!companies && companies.length > 0;
  const scopeReady = !showScope
    || (!requireCompanySelection && scopeValue === UNSET)
    || scopeValue !== UNSET;

  useEffect(() => {
    if (!open) return;
    if (!showScope) return;
    if (scopeValue !== UNSET) return;
    if (allowGlobal && !requireCompanySelection) setScopeValue(GLOBAL);
  }, [open, showScope, allowGlobal, requireCompanySelection, scopeValue]);

  const previewRows = useMemo(() => rows.slice(0, 5), [rows]);

  function currentCompanyId(): string | null {
    if (!showScope) return null;
    if (scopeValue === GLOBAL || scopeValue === UNSET) return null;
    return scopeValue;
  }

  function reset() {
    setFileName("");
    setHeaders([]);
    setRows([]);
    setMapping({});
    setImporting(false);
    setProgress(0);
    setResult(null);
    setScopeValue(UNSET);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  function handleClose(v: boolean) {
    if (!v) reset();
    onOpenChange(v);
  }

  async function handleFile(file: File) {
    try {
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(buf, { type: "array" });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const json = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, { defval: null });
      if (json.length === 0) {
        toast.error("Planilha vazia.");
        return;
      }
      const hdrs = Object.keys(json[0]);
      setFileName(file.name);
      setHeaders(hdrs);
      setRows(json);
      const auto = autoMap(hdrs, fields);
      setMapping(auto);
      const mappedCount = Object.keys(auto).length;
      toast.success(`Planilha carregada: ${json.length} linhas. ${mappedCount}/${fields.length} campos mapeados automaticamente.`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao ler planilha.");
    }
  }

  async function handleImport() {
    if (showScope && requireCompanySelection && scopeValue === UNSET) {
      toast.error("Selecione a empresa (ou Global) para vincular os registros importados.");
      return;
    }
    const missingRequired = fields.filter((f) => f.required && !mapping[f.key]);
    if (missingRequired.length > 0) {
      toast.error(`Mapeamento obrigatório faltando: ${missingRequired.map((f) => f.label).join(", ")}`);
      return;
    }
    setImporting(true);
    setProgress(0);
    let ok = 0, fail = 0, skipped = 0;
    const errors: string[] = [];
    const ctx: ImportContext = { companyId: currentCompanyId() };
    for (let i = 0; i < rows.length; i++) {
      const src = rows[i];
      const mapped: Record<string, unknown> = {};
      for (const f of fields) {
        const col = mapping[f.key];
        if (!col) continue;
        let val: unknown = src[col];
        if (val === "" ) val = null;
        if (f.transform && val != null) {
          try { val = f.transform(val); } catch { /* keep raw */ }
        }
        mapped[f.key] = val;
      }
      try {
        const built = buildRow(mapped, ctx);
        if (!built) throw new Error("Linha inválida");
        if (checkDuplicate) {
          const dup = await checkDuplicate(built, ctx);
          if (dup) { skipped++; setProgress(Math.round(((i + 1) / rows.length) * 100)); continue; }
        }
        await onImportRow(built, i);
        ok++;
      } catch (e) {
        fail++;
        errors.push(`Linha ${i + 2}: ${e instanceof Error ? e.message : "erro"}`);
      }
      setProgress(Math.round(((i + 1) / rows.length) * 100));
    }
    setResult({ ok, fail, skipped, errors: errors.slice(0, 10) });
    setImporting(false);
    if (ok > 0) {
      toast.success(`${ok} registro(s) importado(s).`);
      onDone?.();
    }
    if (skipped > 0) toast.info(`${skipped} registro(s) já existiam e foram ignorados.`);
    if (fail > 0) toast.error(`${fail} linha(s) com erro.`);
  }

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="w-[95vw] sm:max-w-3xl lg:max-w-4xl max-h-[85vh] p-0 gap-0 flex flex-col">
        <DialogHeader className="p-6 pb-3 border-b shrink-0">
          <DialogTitle className="flex items-center gap-2"><FileSpreadsheet className="h-5 w-5" /> {title}</DialogTitle>
          <DialogDescription>{description ?? "Envie um arquivo .xlsx. A plataforma sugere o mapeamento das colunas automaticamente."}</DialogDescription>
        </DialogHeader>
        <div className="flex-1 overflow-y-auto px-6 py-4 min-h-0">

        {showScope && (
          <div className="mb-4 p-3 rounded-lg border bg-slate-50 dark:bg-slate-900 space-y-2">
            <Label className="text-xs flex items-center gap-1">
              <Building2 className="h-3.5 w-3.5" /> Vincular importação à empresa
              {requireCompanySelection && <span className="text-red-500">*</span>}
            </Label>
            <Select value={scopeValue} onValueChange={setScopeValue}>
              <SelectTrigger className="h-9">
                <SelectValue placeholder="Selecione a empresa…" />
              </SelectTrigger>
              <SelectContent>
                {allowGlobal && (
                  <SelectItem value={GLOBAL}>
                    <span className="flex items-center gap-2"><Globe2 className="h-3.5 w-3.5" /> Global — Todas as empresas</span>
                  </SelectItem>
                )}
                {(companies ?? []).map((c) => (
                  <SelectItem key={c.id} value={c.id}>{c.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            {allowGlobal && (
              <p className="text-[11px] text-slate-500">
                A organização está configurada para catálogo global. Você pode importar como Global (compartilhado) ou vincular a uma empresa específica.
              </p>
            )}
          </div>
        )}

        {rows.length === 0 ? (
          <div className="border-2 border-dashed rounded-lg p-10 text-center space-y-3">
            <Upload className="h-10 w-10 mx-auto text-slate-400" />
            <div>
              <p className="font-medium">Selecione um arquivo Excel</p>
              <p className="text-sm text-slate-500">Formatos suportados: .xlsx, .xls, .csv</p>
            </div>
            <input
              ref={fileInputRef}
              type="file"
              accept=".xlsx,.xls,.csv"
              className="hidden"
              onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); }}
            />
            <Button
              onClick={() => fileInputRef.current?.click()}
              disabled={showScope && requireCompanySelection && scopeValue === UNSET}
            >
              <Upload className="h-4 w-4 mr-1" /> Escolher arquivo
            </Button>
            {showScope && requireCompanySelection && scopeValue === UNSET && (
              <p className="text-xs text-amber-600">Selecione uma empresa acima para habilitar a importação.</p>
            )}
          </div>
        ) : (
          <div className="space-y-4">
            <div className="flex items-center justify-between p-3 bg-slate-50 dark:bg-slate-900 rounded">
              <div className="flex items-center gap-2 text-sm">
                <FileSpreadsheet className="h-4 w-4" />
                <span className="font-medium">{fileName}</span>
                <Badge variant="secondary">{rows.length} linhas</Badge>
              </div>
              <Button variant="outline" size="sm" onClick={reset}>Trocar arquivo</Button>
            </div>

            <div>
              <div className="flex items-center gap-2 mb-2">
                <Sparkles className="h-4 w-4 text-amber-500" />
                <h3 className="font-semibold text-sm">Mapeamento inteligente de colunas</h3>
              </div>
              <p className="text-xs text-slate-500 mb-3">Ajuste manualmente se alguma coluna não foi identificada corretamente.</p>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {fields.map((f) => (
                  <div key={f.key} className="flex items-center gap-2">
                    <div className="flex-1">
                      <Label className="text-xs">
                        {f.label}
                        {f.required && <span className="text-red-500 ml-1">*</span>}
                      </Label>
                      <Select
                        value={mapping[f.key] ?? NONE}
                        onValueChange={(v) => setMapping((m) => ({ ...m, [f.key]: v === NONE ? "" : v }))}
                      >
                        <SelectTrigger className="h-8 text-sm">
                          <SelectValue placeholder="— não mapear —" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value={NONE}>— não mapear —</SelectItem>
                          {headers.map((h) => <SelectItem key={h} value={h}>{h}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                    {mapping[f.key] && <CheckCircle2 className="h-4 w-4 text-green-600 mt-4" />}
                  </div>
                ))}
              </div>
            </div>

            <div>
              <h3 className="font-semibold text-sm mb-2">Prévia (primeiras 5 linhas)</h3>
              <div className="border rounded overflow-x-auto max-h-64">
                <Table>
                  <TableHeader>
                    <TableRow>
                      {headers.map((h) => <TableHead key={h} className="text-xs whitespace-nowrap">{h}</TableHead>)}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {previewRows.map((r, i) => (
                      <TableRow key={i}>
                        {headers.map((h) => (
                          <TableCell key={h} className="text-xs whitespace-nowrap">
                            {r[h] == null ? <span className="text-slate-400">—</span> : String(r[h])}
                          </TableCell>
                        ))}
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </div>

            {importing && (
              <div className="space-y-2">
                <div className="flex justify-between text-xs"><span>Importando…</span><span>{progress}%</span></div>
                <Progress value={progress} />
              </div>
            )}

            {result && (
              <div className="space-y-2 text-sm">
                <div className="flex gap-3 flex-wrap">
                  <Badge variant="default" className="bg-green-600"><CheckCircle2 className="h-3 w-3 mr-1" />{result.ok} importados</Badge>
                  {result.skipped > 0 && <Badge variant="secondary">{result.skipped} já existiam</Badge>}
                  {result.fail > 0 && <Badge variant="destructive"><AlertCircle className="h-3 w-3 mr-1" />{result.fail} falhas</Badge>}
                </div>
                {result.errors.length > 0 && (
                  <div className="text-xs bg-red-50 dark:bg-red-950/30 border border-red-200 rounded p-2 space-y-1">
                    {result.errors.map((er, i) => <div key={i}>{er}</div>)}
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        </div>
        <DialogFooter className="p-6 pt-3 border-t shrink-0">
          <Button variant="outline" onClick={() => handleClose(false)}>Fechar</Button>
          {rows.length > 0 && !result && (
            <Button onClick={handleImport} disabled={importing || !scopeReady}>
              {importing && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
              Importar {rows.length} registro(s)
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
