import JSZip from "jszip";

export type XmlArquivo = { nome: string; conteudo: string };

function nomeSeguro(nome: string) {
  return nome.replace(/[^\w.\-]+/g, "_");
}

/** Gera um .zip com os XMLs informados e dispara o download no navegador. */
export async function baixarXmlsZip(arquivos: XmlArquivo[], nomeZip = "nfe-xmls.zip") {
  const zip = new JSZip();
  const usados = new Map<string, number>();
  for (const arq of arquivos) {
    let nome = nomeSeguro(arq.nome);
    const n = usados.get(nome) ?? 0;
    usados.set(nome, n + 1);
    if (n > 0) nome = nome.replace(/(\.xml)?$/i, `_${n}.xml`);
    zip.file(nome, arq.conteudo);
  }
  const blob = await zip.generateAsync({ type: "blob", compression: "DEFLATE" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = nomeZip;
  a.click();
  URL.revokeObjectURL(url);
}

/** Baixa um único XML. */
export function baixarXmlUnico(nome: string, conteudo: string) {
  const url = URL.createObjectURL(new Blob([conteudo], { type: "application/xml" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = nomeSeguro(nome);
  a.click();
  URL.revokeObjectURL(url);
}
