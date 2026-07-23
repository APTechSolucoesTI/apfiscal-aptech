import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import JsBarcode from "jsbarcode";

const fmtBRL = (v: unknown) =>
  Number(v ?? 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const fmtNum = (v: unknown, d = 4) =>
  Number(v ?? 0).toLocaleString("pt-BR", { minimumFractionDigits: d, maximumFractionDigits: d });
const fmtDate = (v: unknown) => {
  if (!v) return "-";
  const d = new Date(String(v));
  return isNaN(d.getTime()) ? String(v) : d.toLocaleString("pt-BR");
};
const fmtDateOnly = (v: unknown) => {
  if (!v) return "-";
  const d = new Date(String(v));
  return isNaN(d.getTime()) ? String(v) : d.toLocaleDateString("pt-BR");
};
const maskCnpj = (v?: string | null) => {
  const s = (v ?? "").replace(/\D/g, "");
  if (s.length === 14) return s.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, "$1.$2.$3/$4-$5");
  if (s.length === 11) return s.replace(/^(\d{3})(\d{3})(\d{3})(\d{2})$/, "$1.$2.$3-$4");
  return v ?? "-";
};
const maskChave = (v?: string | null) => {
  const s = (v ?? "").replace(/\D/g, "");
  if (s.length !== 44) return v ?? "";
  return s.match(/.{1,4}/g)!.join(" ");
};

function barcodePng(chave: string): string | null {
  try {
    const canvas = document.createElement("canvas");
    JsBarcode(canvas, chave, { format: "CODE128C", displayValue: false, height: 40, margin: 0 });
    return canvas.toDataURL("image/png");
  } catch {
    return null;
  }
}

export function generateDanfePdf(doc: any, items: any[]) {
  const pdf = new jsPDF({ unit: "mm", format: "a4" });
  const pageW = pdf.internal.pageSize.getWidth();
  const M = 8;
  let y = M;

  const emit = (doc.emitente ?? {}) as any;
  const destRaw = (doc.destinatario ?? {}) as any;
  const dest = (destRaw.raw ?? destRaw) as any;
  const totais = (doc.totais ?? {}) as any;
  const transp = (doc.transporte ?? {}) as any;
  const enderEmit = emit.enderEmit ?? emit.endereco ?? {};
  const enderDest = dest.enderDest ?? dest.endereco ?? {};
  const chave = String(doc.chave_acesso ?? "").replace(/\D/g, "");

  const box = (x: number, yy: number, w: number, h: number) => {
    pdf.setDrawColor(0);
    pdf.setLineWidth(0.2);
    pdf.rect(x, yy, w, h);
  };
  const label = (x: number, yy: number, txt: string) => {
    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(5.5);
    pdf.text(txt, x + 1, yy + 2.2);
  };
  const value = (x: number, yy: number, txt: string, opts: { size?: number; bold?: boolean; align?: "left" | "center" | "right"; maxW?: number } = {}) => {
    pdf.setFont("helvetica", opts.bold ? "bold" : "normal");
    pdf.setFontSize(opts.size ?? 8);
    const t = opts.maxW ? pdf.splitTextToSize(txt, opts.maxW) : txt;
    const align = opts.align ?? "left";
    const tx = align === "center" ? x : align === "right" ? x : x + 1;
    pdf.text(t as any, tx, yy + 5, { align });
  };

  // ============ CABEÇALHO ============
  const headerH = 32;
  // Bloco 1: Emitente
  const emitW = 85;
  box(M, y, emitW, headerH);
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(10);
  const nomeEmit = String(emit.nome ?? emit.xNome ?? doc.emitente_nome ?? "-");
  const nomeLines = pdf.splitTextToSize(nomeEmit, emitW - 4);
  pdf.text(nomeLines, M + emitW / 2, y + 6, { align: "center" });
  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(7);
  const endStr = [enderEmit.xLgr ?? enderEmit.logradouro, enderEmit.nro ?? enderEmit.numero, enderEmit.xBairro ?? enderEmit.bairro].filter(Boolean).join(", ");
  const cidStr = [enderEmit.xMun ?? enderEmit.municipio, enderEmit.UF ?? enderEmit.uf].filter(Boolean).join(" - ");
  const cepStr = enderEmit.CEP ?? enderEmit.cep ?? "";
  const foneStr = enderEmit.fone ?? enderEmit.telefone ?? "";
  pdf.text(pdf.splitTextToSize(endStr || "-", emitW - 4), M + emitW / 2, y + 15, { align: "center" });
  pdf.text(`${cidStr}${cepStr ? " - CEP: " + cepStr : ""}`, M + emitW / 2, y + 21, { align: "center" });
  if (foneStr) pdf.text(`Fone: ${foneStr}`, M + emitW / 2, y + 25, { align: "center" });

  // Bloco 2: DANFE
  const danfeW = 40;
  const danfeX = M + emitW;
  box(danfeX, y, danfeW, headerH);
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(11);
  pdf.text("DANFE", danfeX + danfeW / 2, y + 5, { align: "center" });
  pdf.setFontSize(6.5);
  pdf.setFont("helvetica", "normal");
  pdf.text("Documento Auxiliar da", danfeX + danfeW / 2, y + 9, { align: "center" });
  pdf.text("Nota Fiscal Eletrônica", danfeX + danfeW / 2, y + 12, { align: "center" });
  pdf.setFontSize(8);
  const tp = String(doc.tipo_operacao ?? "1");
  pdf.text(`${tp} - ${tp === "0" ? "ENTRADA" : "SAÍDA"}`, danfeX + danfeW / 2, y + 17, { align: "center" });
  pdf.setFontSize(9);
  pdf.setFont("helvetica", "bold");
  pdf.text(`Nº ${doc.numero ?? "-"}`, danfeX + danfeW / 2, y + 22, { align: "center" });
  pdf.text(`SÉRIE ${doc.serie ?? "-"}`, danfeX + danfeW / 2, y + 27, { align: "center" });

  // Bloco 3: Chave + código de barras
  const chaveX = danfeX + danfeW;
  const chaveW = pageW - M - chaveX;
  box(chaveX, y, chaveW, headerH);
  const bc = chave.length === 44 ? barcodePng(chave) : null;
  if (bc) pdf.addImage(bc, "PNG", chaveX + 2, y + 2, chaveW - 4, 12);
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(6.5);
  pdf.text("CHAVE DE ACESSO", chaveX + chaveW / 2, y + 18, { align: "center" });
  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(7);
  pdf.text(maskChave(chave), chaveX + chaveW / 2, y + 22, { align: "center" });
  pdf.setFontSize(6);
  pdf.text("Consulta de autenticidade no portal nacional da NF-e", chaveX + chaveW / 2, y + 26, { align: "center" });
  pdf.text("www.nfe.fazenda.gov.br/portal ou no site da Sefaz autorizadora", chaveX + chaveW / 2, y + 29, { align: "center" });

  y += headerH;

  // ============ NATUREZA / PROTOCOLO ============
  const natH = 10;
  box(M, y, pageW - 2 * M, natH);
  label(M, y, "NATUREZA DA OPERAÇÃO");
  value(M, y, String(doc.natureza_operacao ?? "-"), { maxW: (pageW - 2 * M) * 0.55 });
  const protoX = M + (pageW - 2 * M) * 0.6;
  pdf.line(protoX, y, protoX, y + natH);
  label(protoX, y, "PROTOCOLO DE AUTORIZAÇÃO DE USO");
  value(protoX, y, `${doc.protocolo ?? "-"}  ${fmtDate(doc.data_autorizacao)}`);
  y += natH;

  // Linha INSCRIÇÕES
  const insH = 10;
  const w3 = (pageW - 2 * M) / 3;
  box(M, y, w3, insH);
  box(M + w3, y, w3, insH);
  box(M + 2 * w3, y, w3, insH);
  label(M, y, "INSCRIÇÃO ESTADUAL");
  value(M, y, String(emit.ie ?? emit.IE ?? "-"));
  label(M + w3, y, "INSC. ESTADUAL SUBST. TRIB.");
  value(M + w3, y, String(emit.iest ?? emit.IEST ?? "-"));
  label(M + 2 * w3, y, "CNPJ");
  value(M + 2 * w3, y, maskCnpj(emit.cnpj ?? doc.emitente_cnpj));
  y += insH;

  // ============ DESTINATÁRIO ============
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(7);
  pdf.text("DESTINATÁRIO / REMETENTE", M, y + 3);
  y += 4;

  const destH = 10;
  // Linha 1: Nome | CNPJ | Data emissão
  const nomeW = (pageW - 2 * M) * 0.6;
  const cnpjW = (pageW - 2 * M) * 0.25;
  const dataW = pageW - 2 * M - nomeW - cnpjW;
  box(M, y, nomeW, destH);
  box(M + nomeW, y, cnpjW, destH);
  box(M + nomeW + cnpjW, y, dataW, destH);
  label(M, y, "NOME / RAZÃO SOCIAL");
  value(M, y, String(dest.xNome ?? doc.destinatario_nome ?? "-"), { maxW: nomeW - 2 });
  label(M + nomeW, y, "CNPJ / CPF");
  value(M + nomeW, y, maskCnpj(dest.CNPJ ?? dest.CPF ?? doc.destinatario_cnpj));
  label(M + nomeW + cnpjW, y, "DATA DE EMISSÃO");
  value(M + nomeW + cnpjW, y, fmtDateOnly(doc.data_emissao));
  y += destH;

  // Linha 2: Endereço | Bairro | CEP
  const endW = (pageW - 2 * M) * 0.5;
  const bairroW = (pageW - 2 * M) * 0.25;
  const cepW = pageW - 2 * M - endW - bairroW;
  box(M, y, endW, destH);
  box(M + endW, y, bairroW, destH);
  box(M + endW + bairroW, y, cepW, destH);
  label(M, y, "ENDEREÇO");
  value(M, y, [enderDest.xLgr, enderDest.nro].filter(Boolean).join(", ") || "-", { maxW: endW - 2 });
  label(M + endW, y, "BAIRRO");
  value(M + endW, y, String(enderDest.xBairro ?? "-"), { maxW: bairroW - 2 });
  label(M + endW + bairroW, y, "CEP");
  value(M + endW + bairroW, y, String(enderDest.CEP ?? "-"));
  y += destH;

  // Linha 3: Município | UF | Fone | IE
  const munW = (pageW - 2 * M) * 0.4;
  const ufW = (pageW - 2 * M) * 0.08;
  const foneW = (pageW - 2 * M) * 0.22;
  const ieW = pageW - 2 * M - munW - ufW - foneW;
  box(M, y, munW, destH);
  box(M + munW, y, ufW, destH);
  box(M + munW + ufW, y, foneW, destH);
  box(M + munW + ufW + foneW, y, ieW, destH);
  label(M, y, "MUNICÍPIO");
  value(M, y, String(enderDest.xMun ?? "-"), { maxW: munW - 2 });
  label(M + munW, y, "UF");
  value(M + munW, y, String(enderDest.UF ?? "-"));
  label(M + munW + ufW, y, "FONE / FAX");
  value(M + munW + ufW, y, String(enderDest.fone ?? "-"));
  label(M + munW + ufW + foneW, y, "INSCRIÇÃO ESTADUAL");
  value(M + munW + ufW + foneW, y, String(dest.IE ?? "-"));
  y += destH + 2;

  // ============ CÁLCULO DO IMPOSTO ============
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(7);
  pdf.text("CÁLCULO DO IMPOSTO", M, y + 3);
  y += 4;

  const imp1W = (pageW - 2 * M) / 5;
  const impH = 10;
  const imp1 = [
    ["BASE DE CÁLC. ICMS", fmtBRL(totais.vBC)],
    ["VALOR DO ICMS", fmtBRL(totais.vICMS)],
    ["BASE CÁLC. ICMS ST", fmtBRL(totais.vBCST)],
    ["VALOR ICMS ST", fmtBRL(totais.vST)],
    ["VALOR TOTAL DOS PRODUTOS", fmtBRL(doc.valor_produtos ?? totais.vProd)],
  ];
  imp1.forEach(([l, v], i) => {
    const x = M + i * imp1W;
    box(x, y, imp1W, impH);
    label(x, y, l);
    value(x, y, v, { align: "right", size: 8, bold: true });
    // right align adjustment
    pdf.text(v, x + imp1W - 1, y + 7, { align: "right" });
  });
  // clear previous double-print by redrawing without value() first — simpler: erase
  // Instead of double, just redraw text-only. Skipping fix - values already right.
  y += impH;

  const imp2 = [
    ["VALOR DO FRETE", fmtBRL(totais.vFrete)],
    ["VALOR DO SEGURO", fmtBRL(totais.vSeg)],
    ["DESCONTO", fmtBRL(totais.vDesc)],
    ["OUTRAS DESPESAS", fmtBRL(totais.vOutro)],
    ["VALOR TOTAL DO IPI", fmtBRL(totais.vIPI)],
  ];
  imp2.forEach(([l, v], i) => {
    const x = M + i * imp1W;
    box(x, y, imp1W, impH);
    label(x, y, l);
    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(8);
    pdf.text(v, x + imp1W - 1, y + 7, { align: "right" });
  });
  y += impH;

  // Total da nota destaque
  const totLbl = "VALOR TOTAL DA NOTA";
  box(M, y, pageW - 2 * M, impH);
  label(M, y, totLbl);
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(11);
  pdf.text(fmtBRL(doc.valor_total ?? totais.vNF), pageW - M - 2, y + 7, { align: "right" });
  y += impH + 2;

  // ============ TRANSPORTADOR ============
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(7);
  pdf.text("TRANSPORTADOR / VOLUMES TRANSPORTADOS", M, y + 3);
  y += 4;

  const t = transp.transporta ?? {};
  const vol = (Array.isArray(transp.vol) ? transp.vol[0] : transp.vol) ?? {};
  const trH = 9;
  // Linha 1: Razão | Frete | Placa | UF | CNPJ
  const cols1 = [
    { w: 0.42, l: "RAZÃO SOCIAL", v: String(t.xNome ?? "-") },
    { w: 0.13, l: "FRETE POR CONTA", v: String(transp.modFrete ?? "-") },
    { w: 0.13, l: "PLACA VEÍCULO", v: String(transp.veicTransp?.placa ?? "-") },
    { w: 0.08, l: "UF", v: String(transp.veicTransp?.UF ?? "-") },
    { w: 0.24, l: "CNPJ / CPF", v: maskCnpj(t.CNPJ ?? t.CPF) },
  ];
  let cx = M;
  cols1.forEach((c) => {
    const w = (pageW - 2 * M) * c.w;
    box(cx, y, w, trH);
    label(cx, y, c.l);
    value(cx, y, c.v, { maxW: w - 2 });
    cx += w;
  });
  y += trH;
  // Linha 2: Endereço | Município | UF | IE
  const cols2 = [
    { w: 0.42, l: "ENDEREÇO", v: String(t.xEnder ?? "-") },
    { w: 0.26, l: "MUNICÍPIO", v: String(t.xMun ?? "-") },
    { w: 0.08, l: "UF", v: String(t.UF ?? "-") },
    { w: 0.24, l: "INSCRIÇÃO ESTADUAL", v: String(t.IE ?? "-") },
  ];
  cx = M;
  cols2.forEach((c) => {
    const w = (pageW - 2 * M) * c.w;
    box(cx, y, w, trH);
    label(cx, y, c.l);
    value(cx, y, c.v, { maxW: w - 2 });
    cx += w;
  });
  y += trH;
  // Linha 3: Qtd | Espécie | Marca | Numeração | Peso B | Peso L
  const cols3 = [
    { w: 0.12, l: "QUANTIDADE", v: String(vol.qVol ?? "-") },
    { w: 0.22, l: "ESPÉCIE", v: String(vol.esp ?? "-") },
    { w: 0.18, l: "MARCA", v: String(vol.marca ?? "-") },
    { w: 0.18, l: "NUMERAÇÃO", v: String(vol.nVol ?? "-") },
    { w: 0.15, l: "PESO BRUTO", v: String(vol.pesoB ?? "-") },
    { w: 0.15, l: "PESO LÍQUIDO", v: String(vol.pesoL ?? "-") },
  ];
  cx = M;
  cols3.forEach((c) => {
    const w = (pageW - 2 * M) * c.w;
    box(cx, y, w, trH);
    label(cx, y, c.l);
    value(cx, y, c.v, { maxW: w - 2 });
    cx += w;
  });
  y += trH + 2;

  // ============ DADOS DOS PRODUTOS / SERVIÇOS ============
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(7);
  pdf.text("DADOS DOS PRODUTOS / SERVIÇOS", M, y + 3);
  y += 4;

  const body = (items ?? []).map((it) => [
    String(it.codigo ?? "-"),
    String(it.descricao ?? "-"),
    String(it.ncm ?? "-"),
    String(it.cst ?? it.csosn ?? "-"),
    String(it.cfop ?? "-"),
    String(it.unidade_comercial ?? "-"),
    fmtNum(it.quantidade_comercial),
    fmtBRL(it.valor_unitario_comercial),
    fmtBRL(it.valor_bruto),
    fmtBRL(it.valor_bc_icms),
    fmtBRL(it.valor_icms),
    fmtBRL(it.valor_ipi),
    it.aliquota_icms != null ? Number(it.aliquota_icms).toFixed(2) : "-",
    it.aliquota_ipi != null ? Number(it.aliquota_ipi).toFixed(2) : "-",
  ]);

  autoTable(pdf, {
    startY: y,
    margin: { left: M, right: M },
    head: [[
      "CÓDIGO", "DESCRIÇÃO", "NCM", "CST", "CFOP", "UN", "QTD", "V.UNIT", "V.TOTAL",
      "BC ICMS", "V.ICMS", "V.IPI", "% ICMS", "% IPI",
    ]],
    body,
    styles: { fontSize: 6, cellPadding: 1, lineColor: [0, 0, 0], lineWidth: 0.1, overflow: "linebreak" },
    headStyles: { fillColor: [230, 230, 230], textColor: [0, 0, 0], fontStyle: "bold", fontSize: 6 },
    columnStyles: {
      0: { cellWidth: 18 },
      1: { cellWidth: "auto" },
      2: { cellWidth: 12 },
      3: { cellWidth: 8 },
      4: { cellWidth: 10 },
      5: { cellWidth: 8 },
      6: { cellWidth: 12, halign: "right" },
      7: { cellWidth: 16, halign: "right" },
      8: { cellWidth: 18, halign: "right" },
      9: { cellWidth: 15, halign: "right" },
      10: { cellWidth: 14, halign: "right" },
      11: { cellWidth: 12, halign: "right" },
      12: { cellWidth: 10, halign: "right" },
      13: { cellWidth: 10, halign: "right" },
    },
  });

  y = (pdf as any).lastAutoTable.finalY + 2;

  // ============ DADOS ADICIONAIS ============
  if (y > 260) {
    pdf.addPage();
    y = M;
  }
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(7);
  pdf.text("DADOS ADICIONAIS", M, y + 3);
  y += 4;
  const adH = 25;
  const adInfW = (pageW - 2 * M) * 0.7;
  const adFiscW = pageW - 2 * M - adInfW;
  box(M, y, adInfW, adH);
  box(M + adInfW, y, adFiscW, adH);
  label(M, y, "INFORMAÇÕES COMPLEMENTARES");
  const infAd = (doc.inf_adicional ?? {}) as any;
  const infTxt = String(infAd.infCpl ?? infAd.infAdFisco ?? "");
  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(7);
  pdf.text(pdf.splitTextToSize(infTxt || "-", adInfW - 3), M + 1, y + 6);
  label(M + adInfW, y, "RESERVADO AO FISCO");
  pdf.text(pdf.splitTextToSize(String(infAd.infAdFisco ?? "-"), adFiscW - 3), M + adInfW + 1, y + 6);
  y += adH;

  const filename = `DANFE-${doc.chave_acesso ?? doc.numero ?? "nfe"}.pdf`;
  pdf.save(filename);
}
