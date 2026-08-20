// Helpers para extrair os tributos da Reforma Tributária (IBS, CBS e IS)
// tanto no nível do item quanto no total da NF-e.

const n = (v: unknown): number => {
  if (v === null || v === undefined || v === "") return 0;
  const x = Number(String(v).replace(",", "."));
  return Number.isFinite(x) ? x : 0;
};

const txt = (v: unknown): string | null => {
  const s = v === null || v === undefined ? "" : String(v).trim();
  return s || null;
};

export type ItemIbsCbs = {
  present: boolean;
  cst: string | null;
  cClassTrib: string | null;
  vBC: number;
  pIBSUF: number;
  vIBSUF: number;
  pIBSMun: number;
  vIBSMun: number;
  vIBS: number;
  pCBS: number;
  vCBS: number;
  vIS: number;
  pIS: number;
  cstIS: string | null;
};

export function getItemIbsCbs(impostos: any): ItemIbsCbs {
  const imp = (impostos ?? {}) as any;
  const raiz = (imp.IBSCBS ?? {}) as any;
  const g = (raiz.gIBSCBS ?? {}) as any;
  const mono = (raiz.gIBSCBSMono ?? g.gIBSCBSMono ?? {}) as any;
  const uf = (g.gIBSUF ?? {}) as any;
  const mun = (g.gIBSMun ?? {}) as any;
  const cbs = (g.gCBS ?? {}) as any;
  const is = (imp.IS ?? {}) as any;

  const vIBSUF = n(uf.vIBSUF) || n(mono.vIBSMonoUF);
  const vIBSMun = n(mun.vIBSMun) || n(mono.vIBSMonoMun);
  const vIBS = n(g.vIBS) || vIBSUF + vIBSMun || n(mono.vIBSMono);
  const vCBS = n(cbs.vCBS) || n(mono.vCBSMono);
  const vIS = n(is.vIS);

  const present =
    Object.keys(raiz).length > 0 ||
    Object.keys(is).length > 0 ||
    vIBS > 0 ||
    vCBS > 0 ||
    vIS > 0;

  return {
    present,
    cst: txt(raiz.CST),
    cClassTrib: txt(raiz.cClassTrib),
    vBC: n(g.vBC) || n(raiz.vBC),
    pIBSUF: n(uf.pIBSUF),
    vIBSUF,
    pIBSMun: n(mun.pIBSMun),
    vIBSMun,
    vIBS,
    pCBS: n(cbs.pCBS),
    vCBS,
    vIS,
    pIS: n(is.pIS),
    cstIS: txt(is.CSTIS),
  };
}

export type TotaisIbsCbs = {
  present: boolean;
  vBC: number;
  vIBSUF: number;
  vIBSMun: number;
  vIBS: number;
  vCBS: number;
  vIS: number;
};

function totaisFromNode(node: any, isNode: any): TotaisIbsCbs | null {
  if (!node || typeof node !== "object") return null;
  const gIBS = (node.gIBS ?? {}) as any;
  const uf = (gIBS.gIBSUF ?? {}) as any;
  const mun = (gIBS.gIBSMun ?? {}) as any;
  const cbs = (node.gCBS ?? {}) as any;
  const vIBSUF = n(uf.vIBSUF);
  const vIBSMun = n(mun.vIBSMun);
  return {
    present: true,
    vBC: n(node.vBCIBSCBS),
    vIBSUF,
    vIBSMun,
    vIBS: n(gIBS.vIBS) || vIBSUF + vIBSMun,
    vCBS: n(cbs.vCBS),
    vIS: n((isNode ?? {}).vIS),
  };
}

/**
 * Busca os totais de IBS/CBS/IS no bloco de totais, no XML bruto ou,
 * em último caso, somando os valores dos itens.
 */
export function getTotaisIbsCbs(totais: any, rawPayload: any, items: any[]): TotaisIbsCbs {
  const direto = totaisFromNode((totais ?? {}).IBSCBSTot, (totais ?? {}).ISTot);
  if (direto && (direto.vIBS || direto.vCBS || direto.vIS || direto.vBC)) return direto;

  const inf =
    rawPayload?.nfeProc?.NFe?.infNFe ?? rawPayload?.NFe?.infNFe ?? rawPayload?.infNFe ?? null;
  const doRaw = totaisFromNode(inf?.total?.IBSCBSTot, inf?.total?.ISTot);
  if (doRaw && (doRaw.vIBS || doRaw.vCBS || doRaw.vIS || doRaw.vBC)) return doRaw;

  const acc: TotaisIbsCbs = { present: false, vBC: 0, vIBSUF: 0, vIBSMun: 0, vIBS: 0, vCBS: 0, vIS: 0 };
  for (const it of items ?? []) {
    const t = getItemIbsCbs(it?.impostos);
    if (!t.present) continue;
    acc.present = true;
    acc.vBC += t.vBC;
    acc.vIBSUF += t.vIBSUF;
    acc.vIBSMun += t.vIBSMun;
    acc.vIBS += t.vIBS;
    acc.vCBS += t.vCBS;
    acc.vIS += t.vIS;
  }
  return acc;
}
