export type TipoCompra = { id: string; codigo: string; descricao: string; ativo: boolean };

export function labelTipoCompra(t?: Pick<TipoCompra, "codigo" | "descricao"> | null) {
  return t ? `${t.codigo} - ${t.descricao}` : "—";
}

export type ItemTipoCompra = { id: string; tipo_compra_id: string | null };

export type ConsolidacaoTipoCompra = {
  total: number;
  apontados: number;
  faltantes: number;
  unico: string | null;
  multiplos: boolean;
  distribuicao: { tipo_compra_id: string | null; quantidade: number }[];
};

/** Consolida o Tipo de Compra dos itens (reflexo em tempo real, como o rateio de CC). */
export function consolidarTipoCompra(items: ItemTipoCompra[]): ConsolidacaoTipoCompra {
  const total = items.length;
  const apontados = items.filter((i) => !!i.tipo_compra_id).length;
  const mapa = new Map<string | null, number>();
  for (const it of items) mapa.set(it.tipo_compra_id, (mapa.get(it.tipo_compra_id) ?? 0) + 1);
  const distribuicao = [...mapa.entries()]
    .map(([tipo_compra_id, quantidade]) => ({ tipo_compra_id, quantidade }))
    .sort((a, b) => b.quantidade - a.quantidade);
  const distintos = [...mapa.keys()].filter((k) => k !== null) as string[];
  const unico = total > 0 && apontados === total && distintos.length === 1 ? distintos[0] : null;
  return {
    total,
    apontados,
    faltantes: total - apontados,
    unico,
    multiplos: distintos.length > 1,
    distribuicao,
  };
}
