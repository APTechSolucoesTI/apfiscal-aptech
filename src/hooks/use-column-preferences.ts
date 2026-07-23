import { useCallback, useEffect, useMemo, useState } from "react";

export type ColumnDef = {
  key: string;
  label: string;
  alwaysVisible?: boolean;
};

type Prefs = { order: string[]; hidden: string[]; pageSize?: number };

export const PAGE_SIZE_OPTIONS = [10, 20, 50, 100, 500, 1000] as const;
export const DEFAULT_PAGE_SIZE = 20;

const STORAGE_PREFIX = "apfiscal:cols:";

function loadPrefs(tableKey: string): Prefs | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_PREFIX + tableKey);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || !Array.isArray(parsed.order) || !Array.isArray(parsed.hidden)) return null;
    return parsed as Prefs;
  } catch {
    return null;
  }
}

function savePrefs(tableKey: string, prefs: Prefs) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_PREFIX + tableKey, JSON.stringify(prefs));
  } catch {
    // ignore
  }
}

export function useColumnPreferences(tableKey: string, baseColumns: ColumnDef[]) {
  const defaultOrder = useMemo(() => baseColumns.map((c) => c.key), [baseColumns]);
  const baseMap = useMemo(() => {
    const m = new Map<string, ColumnDef>();
    baseColumns.forEach((c) => m.set(c.key, c));
    return m;
  }, [baseColumns]);

  const [prefs, setPrefs] = useState<Prefs>(() => {
    const loaded = loadPrefs(tableKey);
    return loaded ?? { order: defaultOrder, hidden: [], pageSize: DEFAULT_PAGE_SIZE };
  });

  useEffect(() => {
    savePrefs(tableKey, prefs);
  }, [tableKey, prefs]);

  // Reconcile with baseColumns (add new keys at the end, remove stale)
  useEffect(() => {
    setPrefs((prev) => {
      const known = new Set(defaultOrder);
      const orderKept = prev.order.filter((k) => known.has(k));
      const missing = defaultOrder.filter((k) => !orderKept.includes(k));
      const nextOrder = [...orderKept, ...missing];
      const nextHidden = prev.hidden.filter((k) => known.has(k));
      if (
        nextOrder.length === prev.order.length &&
        nextOrder.every((k, i) => k === prev.order[i]) &&
        nextHidden.length === prev.hidden.length
      ) {
        return prev;
      }
      return { ...prev, order: nextOrder, hidden: nextHidden };
    });
  }, [defaultOrder]);

  const allColumns = useMemo<ColumnDef[]>(
    () => prefs.order.map((k) => baseMap.get(k)).filter((c): c is ColumnDef => !!c),
    [prefs.order, baseMap],
  );

  const hiddenSet = useMemo(() => new Set(prefs.hidden), [prefs.hidden]);

  const visibleColumns = useMemo<ColumnDef[]>(
    () => allColumns.filter((c) => c.alwaysVisible || !hiddenSet.has(c.key)),
    [allColumns, hiddenSet],
  );

  const isVisible = useCallback(
    (key: string) => {
      const col = baseMap.get(key);
      if (!col) return false;
      return col.alwaysVisible || !hiddenSet.has(key);
    },
    [baseMap, hiddenSet],
  );

  const toggleVisible = useCallback(
    (key: string) => {
      const col = baseMap.get(key);
      if (!col || col.alwaysVisible) return;
      setPrefs((prev) => {
        const has = prev.hidden.includes(key);
        return { ...prev, hidden: has ? prev.hidden.filter((k) => k !== key) : [...prev.hidden, key] };
      });
    },
    [baseMap],
  );

  const moveColumn = useCallback((fromKey: string, toKey: string) => {
    setPrefs((prev) => {
      const from = prev.order.indexOf(fromKey);
      const to = prev.order.indexOf(toKey);
      if (from < 0 || to < 0 || from === to) return prev;
      const next = [...prev.order];
      const [moved] = next.splice(from, 1);
      next.splice(to, 0, moved);
      return { ...prev, order: next };
    });
  }, []);

  const reset = useCallback(() => {
    setPrefs({ order: defaultOrder, hidden: [] });
  }, [defaultOrder]);

  return { visibleColumns, allColumns, isVisible, toggleVisible, moveColumn, reset };
}
