import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import cepPromise from "cep-promise";

const CompanySchema = z.object({
  status: z.string(),
  cnpj: z.string(),
  tipo: z.string(),
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
    text: z.string()
  })).optional(),
  inscricao_estadual: z.string().optional(),
  inscricao_municipal: z.string().optional(),
});

export type CompanyData = z.infer<typeof CompanySchema>;

/**
 * Server function to fetch company data by CNPJ using the ReceitaWS API (free tier).
 * In a real-world scenario, you might want to use a more complete API like OpenCNPJ
 * or official gov APIs for IE/IM data, which often requires specific state lookups.
 */
export const fetchCompanyByCnpj = createServerFn({ method: "GET" })
  .inputValidator((data) => z.object({ cnpj: z.string() }).parse(data))
  .handler(async ({ data }) => {
    const cleanCnpj = data.cnpj.replace(/\D/g, "");
    
    if (cleanCnpj.length !== 14) {
      throw new Error("CNPJ inválido. Deve conter 14 dígitos.");
    }

    try {
      // Fetching from ReceitaWS (standard for basic data)
      const response = await fetch(`https://receitaws.com.br/v1/cnpj/${cleanCnpj}`);
      
      if (!response.ok) {
        throw new Error(`Erro na API de consulta: ${response.statusText}`);
      }

      const result = await response.json();

      if (result.status === "ERROR") {
        throw new Error(result.message || "CNPJ não encontrado.");
      }

      // IE and IM are harder to get from a single public API globally in Brazil 
      // as they are state/city specific, but we'll mock them or prepare for them.
      // In a real implementation, you'd integrate with Sintegra or specific state gateways.
      
      return CompanySchema.parse({
        ...result,
        inscricao_estadual: "ISENTO", // Mock/Placeholder for demo
        inscricao_municipal: "A consultar", // Mock/Placeholder for demo
      });
    } catch (error) {
      console.error("Error fetching CNPJ:", error);
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
