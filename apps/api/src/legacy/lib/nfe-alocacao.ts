// Funções puras reutilizáveis para o rateio de Centro de Custo na NF-e.

export type CentroCustoAlocacao = { centro_custo_id: string; valor: number };
export type ItemNFe = {
  id: string;
  valor_bruto: number;
  alocacoes: CentroCustoAlocacao[];
};

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/**
 * Consolida no cabeçalho a soma, por centro de custo, dos valores lançados em cada item.
 */
export function recalcularAlocacaoCabecalho(itens: ItemNFe[]): CentroCustoAlocacao[] {
  const map = new Map<string, number>();
  for (const it of itens) {
    for (const a of it.alocacoes) {
      map.set(a.centro_custo_id, (map.get(a.centro_custo_id) ?? 0) + Number(a.valor || 0));
    }
  }
  return Array.from(map, ([centro_custo_id, valor]) => ({ centro_custo_id, valor: round2(valor) }))
    .filter((a) => a.valor > 0);
}

/**
 * Distribui a alocação definida no cabeçalho entre os itens, proporcionalmente
 * ao valor bruto de cada item, ajustando o resíduo no último item.
 */
export function distribuirCabecalhoParaItens(
  alocacoesCabecalho: CentroCustoAlocacao[],
  itens: Array<{ id: string; valor_bruto: number }>,
): Record<string, CentroCustoAlocacao[]> {
  const total = itens.reduce((s, i) => s + Number(i.valor_bruto || 0), 0);
  const out: Record<string, CentroCustoAlocacao[]> = Object.fromEntries(itens.map((i) => [i.id, [] as CentroCustoAlocacao[]]));
  if (total <= 0) return out;
  for (const cc of alocacoesCabecalho) {
    let acumulado = 0;
    itens.forEach((it, idx) => {
      const proporcional = idx === itens.length - 1
        ? round2(cc.valor - acumulado)
        : round2((Number(it.valor_bruto || 0) / total) * cc.valor);
      acumulado += proporcional;
      if (proporcional > 0) out[it.id].push({ centro_custo_id: cc.centro_custo_id, valor: proporcional });
    });
  }
  return out;
}

export function somaAlocacoes(alocacoes: CentroCustoAlocacao[]): number {
  return round2(alocacoes.reduce((s, a) => s + Number(a.valor || 0), 0));
}
