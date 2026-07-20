import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const CompanySchema = z.object({
  status: z.string(),
  cnpj: z.string(),
  tipo: z.string(),
  abertura: z.string(),
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
  situacao: z.string(),
});

export type CompanyData = z.infer<typeof CompanySchema>;

/**
 * Server function to fetch company data by CNPJ using the ReceitaWS API (free tier).
 * Note: For a production app, you might want to use a more robust or paid API 
 * if rate limits are an issue, but ReceitaWS is a standard choice for basic lookups.
 */
export const fetchCompanyByCnpj = createServerFn({ method: "GET" })
  .inputValidator((data) => z.object({ cnpj: z.string() }).parse(data))
  .handler(async ({ data }) => {
    const cleanCnpj = data.cnpj.replace(/\D/g, "");
    
    if (cleanCnpj.length !== 14) {
      throw new Error("CNPJ inválido. Deve conter 14 dígitos.");
    }

    try {
      const response = await fetch(`https://receitaws.com.br/v1/cnpj/${cleanCnpj}`);
      
      if (!response.ok) {
        throw new Error(`Erro na API de consulta: ${response.statusText}`);
      }

      const result = await response.json();

      if (result.status === "ERROR") {
        throw new Error(result.message || "CNPJ não encontrado.");
      }

      return CompanySchema.parse(result);
    } catch (error) {
      console.error("Error fetching CNPJ:", error);
      throw error instanceof Error ? error : new Error("Erro inesperado ao buscar CNPJ.");
    }
  });
