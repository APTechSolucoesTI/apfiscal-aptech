import { createApiAction } from "@/common/action-builder";
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
 * Server function to fetch company data by CNPJ via OpenCNPJ API.
 * https://api.opencnpj.org/{cnpj}
 */
export const fetchCompanyByCnpj = createApiAction({ method: "GET" })
  .inputValidator((data: { cnpj: string }) => z.object({ cnpj: z.string() }).parse(data))
  .handler(async ({ data }) => {
    const cleanCnpj = data.cnpj.replace(/\D/g, "");

    if (cleanCnpj.length !== 14) {
      throw new Error("CNPJ inválido. Deve conter 14 dígitos.");
    }

    try {
      console.log(`Fetching CNPJ ${cleanCnpj} via OpenCNPJ...`);
      const response = await fetch(`https://api.opencnpj.org/${cleanCnpj}`);

      if (!response.ok) {
        if (response.status === 404) {
          throw new Error("CNPJ não encontrado na base de dados.");
        }
        throw new Error(`Erro na API de consulta (Status ${response.status}): ${response.statusText}`);
      }

      const result = await response.json();

      // Build endereço completo
      const logradouro = [result.tipo_logradouro, result.logradouro]
        .filter(Boolean)
        .join(" ")
        .trim();

      // Build telefone principal (DDD + número)
      const telPrincipal = Array.isArray(result.telefones) && result.telefones.length > 0
        ? `(${result.telefones[0].ddd || ""}) ${result.telefones[0].numero || ""}`.trim()
        : "";

      // Build CNAEs (principal + secundários)
      const cnaesArray: any[] = Array.isArray(result.cnaes) && result.cnaes.length > 0
        ? result.cnaes.map((c: any) => ({
            code: c.codigo?.toString() || "",
            text: c.descricao || "",
            main: !!c.is_principal,
          }))
        : [
            {
              code: result.cnae_principal?.toString() || "",
              text: "",
              main: true,
            },
            ...(result.cnaes_secundarios || []).map((c: any) => ({
              code: typeof c === "string" ? c : c.codigo?.toString() || "",
              text: typeof c === "string" ? "" : c.descricao || "",
              main: false,
            })),
          ];

      return CompanySchema.parse({
        status: "OK",
        cnpj: result.cnpj,
        tipo: result.matriz_filial,
        abertura: result.data_inicio_atividade,
        nome: result.razao_social,
        fantasia: result.nome_fantasia || "",
        uf: result.uf,
        municipio: result.municipio,
        logradouro,
        numero: result.numero,
        bairro: result.bairro,
        cep: result.cep,
        email: result.email || "",
        telefone: telPrincipal,
        situacao: result.situacao_cadastral,
        atividades_economicas: cnaesArray,
        responsavel: result.QSA?.[0]?.nome_socio || "",
        inscricao_estadual: "ISENTO",
        inscricao_municipal: "A consultar",
      });
    } catch (error) {
      console.error("Error fetching CNPJ:", error);
      throw error instanceof Error ? error : new Error("Erro inesperado ao buscar CNPJ.");
    }
  });

/**
 * Server function to fetch address by ZIP code (CEP) using cep-promise.
 */
export const fetchAddressByCep = createApiAction({ method: "GET" })
  .inputValidator((data: { cep: string }) => z.object({ cep: z.string() }).parse(data))
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
