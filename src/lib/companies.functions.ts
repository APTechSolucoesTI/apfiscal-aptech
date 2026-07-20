import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import cepPromise from "cep-promise";

const CompanySchema = z.object({
  status: z.string(),
  cnpj: z.string(),
  tipo: z.string().optional(),
  abertura: z.string().optional(),
  nome: z.string(),
  fantasia: z.string().optional(),
  uf: z.string(),
  municipio: z.string(),
  logradouro: z.string(),
  numero: z.string(),
  bairro: z.string(),
  cep: z.string(),
  email: z.string().optional(),
  telefone: z.string().optional(),
  situacao: z.string().optional(),
  atividades_economicas: z.array(z.object({
    code: z.string(),
    text: z.string(),
    main: z.boolean().optional()
  })).optional(),
  atividades_secundarias: z.array(z.object({
    code: z.string(),
    text: z.string()
  })).optional(),
  responsavel: z.string().optional(),
  inscricao_estadual: z.string().optional(),
  inscricao_municipal: z.string().optional(),
});

export type CompanyData = z.infer<typeof CompanySchema>;

/**
 * Server function to fetch company data by CNPJ.
 * Switched to BrasilAPI as it's more reliable and has better coverage for CNPJ data without the strict CORS/Rate limits of ReceitaWS free tier.
 */
export const fetchCompanyByCnpj = createServerFn({ method: "GET" })
  .inputValidator((data) => z.object({ cnpj: z.string() }).parse(data))
  .handler(async ({ data }) => {
    const cleanCnpj = data.cnpj.replace(/\D/g, "");
    
    if (cleanCnpj.length !== 14) {
      throw new Error("CNPJ inválido. Deve conter 14 dígitos.");
    }

    try {
      console.log(`Fetching CNPJ ${cleanCnpj} via BrasilAPI...`);
      // BrasilAPI is generally more stable and comprehensive for public Brazilian data
      const response = await fetch(`https://brasilapi.com.br/api/cnpj/v1/${cleanCnpj}`);
      
      if (!response.ok) {
        if (response.status === 404) {
           throw new Error("CNPJ não encontrado na base de dados.");
        }
        throw new Error(`Erro na API de consulta (Status ${response.status}): ${response.statusText}`);
      }

      const result = await response.json();

      // Mapping BrasilAPI response to our internal CompanySchema
      return CompanySchema.parse({
        status: "OK",
        cnpj: result.cnpj,
        tipo: result.descricao_identificador_matriz_filial,
        abertura: result.data_inicio_atividade,
        nome: result.razao_social,
        fantasia: result.nome_fantasia || "",
        uf: result.uf,
        municipio: result.municipio,
        logradouro: result.logradouro,
        numero: result.numero,
        bairro: result.bairro,
        cep: result.cep,
        email: result.email || "",
        telefone: result.ddd_telefone_1 || "",
        situacao: result.descricao_situacao_cadastral,
        atividades_economicas: [
          { 
            code: result.cnae_fiscal?.toString() || "", 
            text: result.cnae_fiscal_descricao || "",
            main: true
          },
          ...(result.cnaes_secundarios || []).map((c: any) => ({
            code: c.codigo?.toString() || "",
            text: c.descricao || "",
            main: false
          }))
        ],
        responsavel: result.qsa?.[0]?.nome || "",
        inscricao_estadual: "ISENTO",
        inscricao_municipal: "A consultar",
      });
    } catch (error) {
      console.error("Error fetching CNPJ:", error);
      
      // Fallback to ReceitaWS if BrasilAPI fails for some reason
      try {
        console.log(`Attempting fallback to ReceitaWS for CNPJ ${cleanCnpj}...`);
        const fallbackResponse = await fetch(`https://receitaws.com.br/v1/cnpj/${cleanCnpj}`);
        if (fallbackResponse.ok) {
          const fallbackResult = await fallbackResponse.json();
          if (fallbackResult.status !== "ERROR") {
             return CompanySchema.parse({
                ...fallbackResult,
                inscricao_estadual: "ISENTO",
                inscricao_municipal: "A consultar",
             });
          }
        }
      } catch (fallbackError) {
        console.error("Fallback also failed:", fallbackError);
      }

      throw error instanceof Error ? error : new Error("Erro inesperado ao buscar CNPJ.");
    }
  });

/**
 * Server function to fetch address by ZIP code (CEP) using cep-promise.
 */
export const fetchAddressByCep = createServerFn({ method: "GET" })
  .inputValidator((data) => z.object({ cep: z.string() }).parse(data))
  .handler(async ({ data }) => {
    const cleanCep = data.cep.replace(/\D/g, "");
    
    if (cleanCep.length !== 8) {
      throw new Error("CEP inválido.");
    }

    try {
      const address = await cepPromise(cleanCep);
      return address;
    } catch (error) {
      console.error("Error fetching CEP:", error);
      throw error instanceof Error ? error : new Error("Erro ao buscar CEP.");
    }
  });
