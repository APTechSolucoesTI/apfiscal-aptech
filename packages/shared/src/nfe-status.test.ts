import { describe, expect, it } from "vitest";
import { nfeBloqueada, podeAprovar, podeEditarApontamentos, podeVincularProduto } from "./nfe-status";

describe("contrato de status da NF-e", () => {
  it("bloqueia integralmente uma nota integrada na TOTVS", () => {
    expect(nfeBloqueada("integrado_totvs")).toBe(true);
    expect(podeVincularProduto("integrado_totvs")).toBe(false);
    expect(podeEditarApontamentos("integrado_totvs")).toBe(false);
  });

  it("só aprova nota pendente", () => {
    expect(podeAprovar("pendente_confirmacao")).toBe(true);
    expect(podeAprovar("aprovada")).toBe(false);
  });

  it("permite vínculos e rateios apenas no intervalo aprovado", () => {
    expect(podeVincularProduto("aprovada")).toBe(true);
    expect(podeEditarApontamentos("pronta_para_integracao")).toBe(true);
  });
});
