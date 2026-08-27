import { Injectable } from "@nestjs/common";
import * as sql from "mssql";

const CLONEABLE_TABLES = new Set([
  "TMOV",
  "TITMMOV",
  "TMOVCOMPL",
  "TITMMOVCOMPL",
  "TNFE",
  "TMOVFISCAL",
  "TMOVFISCALSERV",
  "TITMMOVFISCAL",
  "TTRBMOV",
  "TMOVRATCCU",
  "TITMMOVRATCCU",
  "FLAN",
  "FCFO",
  "FCFOHISTORICO",
  "TPRODUTO",
  "TPRODUTODEF",
]);

type SqlValue = string | number | boolean | Date | Buffer | null;
type Overrides = Record<string, SqlValue>;

export type RmDocument = {
  tipo: "nfe" | "nfse";
  chave_acesso: string;
  numero: string;
  serie: string | null;
  data_emissao: string | null;
  valor_total: number | null;
  valor_produtos: number | null;
  valor_frete: number | null;
  valor_seguro: number | null;
  valor_desconto: number | null;
  valor_outros: number | null;
  cobranca: unknown;
  emitente_cnpj: string | null;
  emitente_nome: string | null;
  competence_date?: string | null;
  service_gross_value?: number | null;
  iss_base_value?: number | null;
  iss_rate?: number | null;
  iss_value?: number | null;
  service_code_municipal?: string | null;
  service_description?: string | null;
};

export type RmItem = {
  numero_item: number;
  codigo: string | null;
  productErpCode: string;
  localProductId?: string;
  createProduct?: boolean;
  productDescription?: string | null;
  purchaseTypeCode?: string | null;
  cfop?: string | null;
  unidade_comercial: string | null;
  quantidade_comercial: number | null;
  valor_unitario_comercial: number | null;
  valor_bruto: number | null;
  valor_desconto: number | null;
  valor_frete: number | null;
  valor_seguro: number | null;
  valor_outros: number | null;
  valor_total: number | null;
  localEstoqueCode: string | null;
  costCenterCode: string | null;
  allocations: Array<{ costCenterCode: string; value: number }>;
  taxes: unknown;
};

export type RmWriteInput = {
  coligada: number;
  filial: number;
  supplierCode: string | null;
  supplierTaxId: string;
  supplier: {
    legalName: string | null;
    tradeName: string | null;
    stateRegistration: string | null;
    municipalRegistration: string | null;
    street: string | null;
    number: string | null;
    complement: string | null;
    district: string | null;
    zipCode: string | null;
    city: string | null;
    state: string | null;
    phone: string | null;
    email: string | null;
    personType: string | null;
  };
  document: RmDocument;
  items: RmItem[];
  costCenterCode: string | null;
  allocations: Array<{ costCenterCode: string; value: number }>;
  financialPlanCode: string | null;
  purchaseTypeCode: string | null;
  integrationAt: string;
  nfeCodTmv: string;
  nfseCodTmv: string;
  user: string;
};

export type RmWriteResult = {
  idMov: number;
  codTmv: string;
  supplierCode: string;
  itemCount: number;
  installmentCount: number;
  alreadyExisted: boolean;
  createdProducts: Array<{ localProductId: string; erpCode: string }>;
};

type Column = { name: string };

function identifier(value: string) {
  return `[${value.replaceAll("]", "]]")}]`;
}

function number(value: number | null | undefined, fallback = 0) {
  return Number.isFinite(value) ? Number(value) : fallback;
}

function date(value: string | null | undefined) {
  const parsed = value ? new Date(value) : new Date();
  if (Number.isNaN(parsed.getTime())) throw new Error(`Data fiscal inválida: ${value}.`);
  return parsed;
}

function movementNumber(value: string) {
  const digits = value.replace(/\D/g, "");
  if (!digits || digits.length > 9)
    throw new Error(`O número do movimento deve conter no máximo 9 dígitos: ${value}.`);
  return digits.padStart(9, "0");
}

function formatTaxId(value: string) {
  const digits = value.replace(/\D/g, "");
  if (digits.length === 14)
    return digits.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, "$1.$2.$3/$4-$5");
  if (digits.length === 11)
    return digits.replace(/^(\d{3})(\d{3})(\d{3})(\d{2})$/, "$1.$2.$3-$4");
  return value;
}

function purchaseNatureBase(type: string | null | undefined) {
  if (type === "07") return "556";
  if (type === "08") return "406";
  if (type === "09") return "933";
  if (type === "00" || type === "04") return "102";
  return "949";
}

function records(value: unknown): Record<string, unknown>[] {
  if (!value || typeof value !== "object") return [];
  const record = value as Record<string, unknown>;
  return [record, ...Object.values(record).flatMap(records)];
}

function taxValues(value: unknown, code: string) {
  const aliases: Record<string, { value: string; rate: string; base: string }> = {
    ICMS: { value: "vICMS", rate: "pICMS", base: "vBC" },
    PIS: { value: "vPIS", rate: "pPIS", base: "vBC" },
    COFINS: { value: "vCOFINS", rate: "pCOFINS", base: "vBC" },
    IPI: { value: "vIPI", rate: "pIPI", base: "vBC" },
    II: { value: "vII", rate: "pII", base: "vBC" },
    ISS: { value: "vISSQN", rate: "pISSQN", base: "vBC" },
    CBS: { value: "vCBS", rate: "pCBS", base: "vBC" },
    IBS_UF: { value: "vIBSUF", rate: "pIBSUF", base: "vBC" },
    IBS_MUN: { value: "vIBSMun", rate: "pIBSMun", base: "vBC" },
  };
  const fields = aliases[code.toUpperCase()];
  if (!fields)
    return { base: 0, rate: 0, value: 0, cst: null as string | null, enq: null as string | null };
  const node = records(value).find((item) => fields.value in item || fields.rate in item);
  return {
    base: Number(node?.[fields.base] ?? 0) || 0,
    rate: Number(node?.[fields.rate] ?? 0) || 0,
    value: Number(node?.[fields.value] ?? 0) || 0,
    cst:
      node?.CST === undefined
        ? node?.CSOSN === undefined
          ? null
          : String(node.CSOSN)
        : String(node.CST),
    enq: node?.cEnq === undefined ? null : String(node.cEnq),
  };
}

function installments(value: unknown, total: number, issueDate: Date) {
  const charge = value && typeof value === "object" ? (value as Record<string, unknown>) : {};
  const raw = charge.dup;
  const rows = Array.isArray(raw) ? raw : raw && typeof raw === "object" ? [raw] : [];
  const parsed = rows.map((row, index) => {
    const record = row as Record<string, unknown>;
    const due = typeof record.dVenc === "string" ? new Date(`${record.dVenc}T12:00:00`) : issueDate;
    return {
      number: String(record.nDup ?? index + 1).slice(0, 8),
      due: Number.isNaN(due.getTime()) ? issueDate : due,
      value: Number(record.vDup ?? 0),
    };
  });
  return parsed.length > 0 ? parsed : [{ number: "1", due: issueDate, value: total }];
}

@Injectable()
export class TotvsRmWriterService {
  private async nature(
    transaction: sql.Transaction,
    coligada: number,
    purchaseTypeCode: string | null | undefined,
    cfop: string | null | undefined,
  ) {
    const prefix =
      cfop?.replace(/\D/g, "").charAt(0) === "6"
        ? "2"
        : cfop?.replace(/\D/g, "").charAt(0) === "5"
          ? "1"
          : null;
    if (!prefix || !purchaseTypeCode)
      throw new Error("Tipo de Compra e CFOP são obrigatórios para determinar a natureza no RM.");
    const code = `${prefix}.${purchaseNatureBase(purchaseTypeCode)}`;
    const result = await new sql.Request(transaction)
      .input("coligada", sql.SmallInt, coligada)
      .input("code", sql.VarChar, code).query<{ IDNAT: number; CODNAT: string; FISCAL: number }>(`
        SELECT IDNAT,CODNAT,FISCAL FROM dbo.DCFOP WITH (HOLDLOCK)
        WHERE CODCOLIGADA=@coligada AND ATIVO=1 AND (CODNAT=@code OR CODNAT LIKE @code+'.%')
        ORDER BY CASE WHEN CODNAT=@code THEN 0 ELSE 1 END,CODNAT
      `);
    const header = result.recordset.find((row) => row.CODNAT === code) ?? result.recordset[0];
    const item = result.recordset.find((row) => row.CODNAT !== code && row.FISCAL === 1) ?? header;
    if (!header || !item)
      throw new Error(
        `A natureza ${code} não está cadastrada/ativa na DCFOP da coligada ${coligada}.`,
      );
    return { header, item };
  }

  private async resolveProduct(transaction: sql.Transaction, input: RmWriteInput, item: RmItem) {
    const existing = await new sql.Request(transaction)
      .input("productCode", sql.VarChar, item.productErpCode)
      .input("coligada", sql.SmallInt, input.coligada).query<{
      IDPRD: number;
      CODUNDVENDA: string | null;
    }>(`
        SELECT TOP 1 p.IDPRD,d.CODUNDVENDA FROM dbo.TPRODUTO p
        LEFT JOIN dbo.TPRODUTODEF d ON d.IDPRD=p.IDPRD AND d.CODCOLIGADA=@coligada
        WHERE p.CODIGOPRD=@productCode AND p.CODCOLPRD IN (0,@coligada) AND p.ULTIMONIVEL=1 AND p.INATIVO=0
        ORDER BY CASE WHEN p.CODCOLPRD=@coligada THEN 0 ELSE 1 END
      `);
    if (existing.recordset[0]) return { ...existing.recordset[0], created: false };
    if (!item.createProduct)
      throw new Error(`Produto ${item.productErpCode} não existe ou está inativo no RM.`);

    const prefix = item.productErpCode.split(".").slice(0, 3).join(".");
    const source = await new sql.Request(transaction)
      .input("coligada", sql.SmallInt, input.coligada)
      .input("prefix", sql.VarChar, `${prefix}.%`).query<{
      IDPRD: number;
      CODUNDVENDA: string | null;
    }>(`
        SELECT TOP 1 p.IDPRD,d.CODUNDVENDA FROM dbo.TPRODUTO p
        JOIN dbo.TPRODUTODEF d ON d.IDPRD=p.IDPRD AND d.CODCOLIGADA=@coligada
        WHERE p.CODCOLPRD=0 AND p.ULTIMONIVEL=1 AND p.INATIVO=0 AND p.CODIGOPRD LIKE @prefix
        ORDER BY p.IDPRD DESC
      `);
    if (!source.recordset[0])
      throw new Error(
        `Não existe produto-modelo no grupo ${prefix} para criar ${item.productErpCode}.`,
      );
    const idPrd = await this.nextGenerator(transaction, 0, "T", "IDPRD");
    const reduced = await new sql.Request(transaction).query<{ value: number }>(`
      SELECT ISNULL(MAX(TRY_CONVERT(int,CODIGOREDUZIDO)),0)+1 AS value
      FROM dbo.TPRODUTO WITH (UPDLOCK,HOLDLOCK)
    `);
    const now = date(input.integrationAt);
    await this.clone(
      transaction,
      "TPRODUTO",
      "src.CODCOLPRD=0 AND src.IDPRD=@sourceId",
      { sourceId: source.recordset[0].IDPRD },
      {
        IDPRD: idPrd,
        ID: idPrd,
        CODIGOPRD: item.productErpCode,
        CODIGOREDUZIDO: String(reduced.recordset[0].value).padStart(4, "0"),
        NOMEFANTASIA: item.productDescription ?? item.productErpCode,
        DESCRICAO: item.productDescription ?? item.productErpCode,
        DESCRICAOAUX: item.productDescription ?? item.productErpCode,
        DTCADASTRAMENTO: now,
        DATAULTALTERACAO: now,
        RECCREATEDBY: input.user,
        RECCREATEDON: now,
        RECMODIFIEDBY: input.user,
        RECMODIFIEDON: now,
      },
    );
    await this.clone(
      transaction,
      "TPRODUTODEF",
      "src.CODCOLIGADA=@sourceColigada AND src.IDPRD=@sourceId",
      { sourceColigada: input.coligada, sourceId: source.recordset[0].IDPRD },
      {
        IDPRD: idPrd,
        CODUNDVENDA: item.unidade_comercial ?? source.recordset[0].CODUNDVENDA,
        CODUNDCOMPRA: item.unidade_comercial ?? source.recordset[0].CODUNDVENDA,
        RECCREATEDBY: input.user,
        RECCREATEDON: now,
        RECMODIFIEDBY: input.user,
        RECMODIFIEDON: now,
      },
    );
    return {
      IDPRD: idPrd,
      CODUNDVENDA: item.unidade_comercial ?? source.recordset[0].CODUNDVENDA,
      created: true,
    };
  }

  private async columns(transaction: sql.Transaction, table: string) {
    if (!CLONEABLE_TABLES.has(table))
      throw new Error(`Tabela RM não autorizada para clonagem: ${table}.`);
    const result = await new sql.Request(transaction).input(
      "objectName",
      sql.NVarChar,
      `dbo.${table}`,
    ).query<Column>(`
        SELECT c.name
        FROM sys.columns c
        WHERE c.object_id = OBJECT_ID(@objectName)
          AND c.is_identity = 0
          AND c.is_computed = 0
          AND TYPE_NAME(c.system_type_id) NOT IN ('timestamp', 'rowversion')
        ORDER BY c.column_id
      `);
    if (result.recordset.length === 0)
      throw new Error(`A tabela dbo.${table} não foi localizada no RM.`);
    return result.recordset.map((item) => item.name);
  }

  private async clone(
    transaction: sql.Transaction,
    table: string,
    where: string,
    source: Overrides,
    overrides: Overrides,
  ) {
    const columns = await this.columns(transaction, table);
    const request = new sql.Request(transaction);
    const expressions = columns.map((column, index) => {
      if (!(column in overrides)) return `src.${identifier(column)}`;
      const value = overrides[column];
      if (value === null) return "NULL";
      const parameter = `override_${index}`;
      request.input(parameter, value);
      return `@${parameter}`;
    });
    Object.entries(source).forEach(([key, value]) => {
      if (value !== null) request.input(key, value);
    });
    const result = await request.query(`
      INSERT INTO dbo.${identifier(table)} (${columns.map(identifier).join(",")})
      SELECT ${expressions.join(",")}
      FROM dbo.${identifier(table)} src WITH (HOLDLOCK)
      WHERE ${where}
    `);
    return result.rowsAffected[0] ?? 0;
  }

  private async nextGenerator(
    transaction: sql.Transaction,
    coligada: number,
    system: string,
    code: string,
  ) {
    const result = await new sql.Request(transaction)
      .input("coligada", sql.SmallInt, coligada)
      .input("system", sql.VarChar, system)
      .input("code", sql.VarChar, code).query<{ value: number }>(`
        UPDATE dbo.GAUTOINC WITH (UPDLOCK, HOLDLOCK)
        SET VALAUTOINC = VALAUTOINC + 1,
            RECMODIFIEDBY = 'APFISCAL',
            RECMODIFIEDON = GETDATE()
        WHERE CODCOLIGADA = @coligada AND CODSISTEMA = @system AND CODAUTOINC = @code;
        SELECT VALAUTOINC AS value FROM dbo.GAUTOINC WITH (UPDLOCK, HOLDLOCK)
        WHERE CODCOLIGADA = @coligada AND CODSISTEMA = @system AND CODAUTOINC = @code;
      `);
    const value = result.recordset[0]?.value;
    if (!value)
      throw new Error(`Gerador ${system}/${code} não encontrado para a coligada ${coligada}.`);
    return value;
  }

  private async nextTableValue(
    transaction: sql.Transaction,
    table: "FLAN" | "TMOVRATCCU" | "TITMMOVRATCCU",
    column: "ID" | "IDHISTORICO" | "IDMOVRATCCU",
  ) {
    const result = await new sql.Request(transaction).query<{ value: number }>(
      `SELECT ISNULL(MAX(${identifier(column)}), 0) + 1 AS value FROM dbo.${identifier(table)} WITH (UPDLOCK, HOLDLOCK)`,
    );
    return result.recordset[0].value;
  }

  private async ensureSupplier(
    transaction: sql.Transaction,
    input: RmWriteInput,
    supplierTaxId: string,
  ) {
    const existingResult = await new sql.Request(transaction)
      .input("supplierCode", sql.VarChar, input.supplierCode ?? "")
      .input("supplierTaxId", sql.VarChar, supplierTaxId).query<{
      IDCFO: number;
      CODCFO: string;
      IDHISTORICO: number | null;
    }>(`
      SELECT TOP 1 cfo.IDCFO,cfo.CODCFO,
        (SELECT MAX(hist.IDHISTORICO) FROM dbo.FCFOHISTORICO hist
         WHERE hist.CODCOLIGADA=0 AND hist.CODCFO=cfo.CODCFO) AS IDHISTORICO
      FROM dbo.FCFO cfo WITH (UPDLOCK,HOLDLOCK)
      WHERE cfo.CODCOLIGADA=0
        AND (cfo.CODCFO=@supplierCode
          OR REPLACE(REPLACE(REPLACE(cfo.CGCCFO,'.',''),'/',''),'-','')=@supplierTaxId)
      ORDER BY CASE WHEN cfo.CODCFO=@supplierCode THEN 0 ELSE 1 END
    `);
    const existing = existingResult.recordset[0];
    if (existing?.IDHISTORICO)
      return { ...existing, IDHISTORICO: existing.IDHISTORICO };

    const template = await new sql.Request(transaction).query<{
      IDCFO: number;
      CODCFO: string;
      IDHISTORICO: number;
    }>(`
      SELECT TOP 1 cfo.IDCFO,cfo.CODCFO,h.IDHISTORICO
      FROM dbo.FCFO cfo WITH (HOLDLOCK)
      JOIN dbo.FCFOHISTORICO h WITH (HOLDLOCK)
        ON h.CODCOLIGADA=0 AND h.CODCFO=cfo.CODCFO
      WHERE cfo.CODCOLIGADA=0 AND cfo.ATIVO=1 AND cfo.PAGREC IN (1,3)
      ORDER BY cfo.IDCFO DESC,h.IDHISTORICO DESC
    `);
    const source = template.recordset[0];
    if (!source) throw new Error("O RM não possui fornecedor-modelo global válido para cadastro.");

    const now = date(input.integrationAt);
    const historyId = await this.nextGenerator(transaction, 0, "F", "IDHISTORICO");
    const name = (input.supplier.legalName || input.document.emitente_nome || supplierTaxId).slice(
      0,
      100,
    );
    const tradeName = (input.supplier.tradeName || name).slice(0, 100);
    const personType =
      input.supplier.personType?.toUpperCase().startsWith("F") || supplierTaxId.length === 11
        ? "F"
        : "J";
    let supplierCode = existing?.CODCFO;
    let idCfo = existing?.IDCFO;
    if (!existing) {
      idCfo = await this.nextGenerator(transaction, 0, "F", "IDCFO");
      const nextCode = await new sql.Request(transaction).query<{ value: number }>(`
        SELECT ISNULL(MAX(TRY_CONVERT(int,SUBSTRING(CODCFO,2,20))),0)+1 AS value
        FROM dbo.FCFO WITH (UPDLOCK,HOLDLOCK)
        WHERE CODCOLIGADA=0 AND CODCFO LIKE 'C%'
      `);
      supplierCode = `C${String(nextCode.recordset[0].value).padStart(6, "0")}`;
      const rows = await this.clone(
        transaction,
        "FCFO",
        "src.CODCOLIGADA=0 AND src.IDCFO=@sourceId",
        { sourceId: source.IDCFO },
        {
          IDCFO: idCfo,
          CODCFO: supplierCode,
          CODEXTERNO: supplierCode,
          NOME: name,
          NOMEFANTASIA: tradeName,
          CGCCFO: formatTaxId(supplierTaxId),
          INSCRESTADUAL: input.supplier.stateRegistration ?? "",
          INSCRMUNICIPAL: input.supplier.municipalRegistration ?? "",
          PESSOAFISOUJUR: personType,
          RUA: input.supplier.street ?? "",
          NUMERO: input.supplier.number ?? "",
          COMPLEMENTO: input.supplier.complement ?? "",
          BAIRRO: input.supplier.district ?? "",
          CEP: input.supplier.zipCode ?? "",
          CIDADE: input.supplier.city ?? "",
          CODETD: input.supplier.state ?? "",
          TELEFONE: input.supplier.phone ?? "",
          EMAIL: input.supplier.email ?? "",
          DATACRIACAO: now,
          DATAULTALTERACAO: now,
          USUARIOCRIACAO: input.user,
          RECCREATEDBY: input.user,
          RECCREATEDON: now,
          RECMODIFIEDBY: input.user,
          RECMODIFIEDON: now,
        },
      );
      if (rows !== 1) throw new Error("Não foi possível criar o fornecedor global no RM.");
    }

    const historyRows = await this.clone(
      transaction,
      "FCFOHISTORICO",
      "src.CODCOLIGADA=0 AND src.IDHISTORICO=@sourceHistoryId",
      { sourceHistoryId: source.IDHISTORICO },
      {
        IDHISTORICO: historyId,
        CODCFO: supplierCode!,
        NOME: name,
        NOMEFANTASIA: tradeName,
        CGCCFO: formatTaxId(supplierTaxId),
        INSCRESTADUAL: input.supplier.stateRegistration ?? "",
        INSCRMUNICIPAL: input.supplier.municipalRegistration ?? "",
        PESSOAFISOUJUR: personType,
        RUA: input.supplier.street ?? "",
        NUMERO: input.supplier.number ?? "",
        COMPLEMENTO: input.supplier.complement ?? "",
        BAIRRO: input.supplier.district ?? "",
        CEP: input.supplier.zipCode ?? "",
        CIDADE: input.supplier.city ?? "",
        CODETD: input.supplier.state ?? "",
        TELEFONE: input.supplier.phone ?? "",
        EMAIL: input.supplier.email ?? "",
        DATACRIACAO: now,
        USUARIO: input.user,
        RECCREATEDBY: input.user,
        RECCREATEDON: now,
        RECMODIFIEDBY: input.user,
        RECMODIFIEDON: now,
      },
    );
    if (historyRows !== 1) throw new Error("Não foi possível criar o histórico do fornecedor no RM.");
    return { IDCFO: idCfo!, CODCFO: supplierCode!, IDHISTORICO: historyId };
  }

  async write(transaction: sql.Transaction, input: RmWriteInput): Promise<RmWriteResult> {
    const codTmv = input.document.tipo === "nfse" ? input.nfseCodTmv : input.nfeCodTmv;
    const supplierTaxId = input.supplierTaxId.replace(/\D/g, "");
    if (![11, 14].includes(supplierTaxId.length))
      throw new Error("O CPF/CNPJ do fornecedor é obrigatório para integrar o documento no RM.");
    if (input.items.length === 0)
      throw new Error("O documento fiscal não possui itens válidos para integrar no RM.");
    if (new Set(input.items.map((item) => item.numero_item)).size !== input.items.length)
      throw new Error("O documento fiscal possui números de item duplicados.");
    if (
      input.items.some((item) => !Number.isSafeInteger(item.numero_item) || item.numero_item <= 0)
    )
      throw new Error("Todos os itens precisam ter um número sequencial inteiro positivo.");

    const formattedNumber = movementNumber(input.document.numero);
    const duplicate = await new sql.Request(transaction)
      .input("coligada", sql.SmallInt, input.coligada)
      .input("key", sql.VarChar, input.document.chave_acesso)
      .input("number", sql.VarChar, formattedNumber)
      .input("series", sql.VarChar, input.document.serie ?? "")
      .input("codTmv", sql.VarChar, codTmv)
      .input("isNfse", sql.Bit, input.document.tipo === "nfse")
      .input("supplierTaxId", sql.VarChar, supplierTaxId).query<{
      IDMOV: number;
      CODCFO: string;
      ITEM_COUNT: number;
      INSTALLMENT_COUNT: number;
    }>(`
        SELECT TOP 1 mov.IDMOV,mov.CODCFO,
          (SELECT COUNT(*) FROM dbo.TITMMOV item WHERE item.CODCOLIGADA=mov.CODCOLIGADA AND item.IDMOV=mov.IDMOV) AS ITEM_COUNT,
          (SELECT COUNT(*) FROM dbo.FLAN lan WHERE lan.CODCOLIGADA=mov.CODCOLIGADA AND lan.IDMOV=mov.IDMOV) AS INSTALLMENT_COUNT
        FROM dbo.TMOV mov WITH (UPDLOCK, HOLDLOCK)
        LEFT JOIN dbo.FCFO cfo ON cfo.CODCOLIGADA=mov.CODCOLCFO AND cfo.CODCFO=mov.CODCFO
        WHERE mov.CODCOLIGADA=@coligada AND (
          (@key<>'' AND mov.CHAVEACESSONFE=@key)
          OR (mov.CODTMV=@codTmv AND mov.NUMEROMOV=@number AND ISNULL(mov.SERIE,'')=@series)
          OR (@isNfse=1 AND mov.CODTMV=@codTmv AND TRY_CONVERT(bigint,mov.NUMEROMOV)=TRY_CONVERT(bigint,@number)
              AND REPLACE(REPLACE(REPLACE(cfo.CGCCFO,'.',''),'/',''),'-','')=@supplierTaxId)
        )
        ORDER BY mov.IDMOV DESC
      `);
    if (duplicate.recordset[0]) {
      return {
        idMov: duplicate.recordset[0].IDMOV,
        codTmv,
        supplierCode: duplicate.recordset[0].CODCFO,
        itemCount: duplicate.recordset[0].ITEM_COUNT,
        installmentCount: duplicate.recordset[0].INSTALLMENT_COUNT,
        alreadyExisted: true,
        createdProducts: [],
      };
    }

    const template = await new sql.Request(transaction)
      .input("coligada", sql.SmallInt, input.coligada)
      .input("filial", sql.SmallInt, input.filial)
      .input("codTmv", sql.VarChar, codTmv).query<{ IDMOV: number }>(`
        SELECT TOP 1 IDMOV FROM dbo.TMOV WITH (HOLDLOCK)
        WHERE CODCOLIGADA=@coligada AND CODTMV=@codTmv
        ORDER BY CASE WHEN CODFILIAL=@filial THEN 0 ELSE 1 END, IDMOV DESC
      `);
    const templateId = template.recordset[0]?.IDMOV;
    if (!templateId)
      throw new Error(`Não existe movimento-modelo ${codTmv} na coligada ${input.coligada}.`);

    const supplier = await this.ensureSupplier(transaction, input, supplierTaxId);
    const supplierCode = supplier.CODCFO;

    const issueDate = date(input.document.data_emissao);
    const total = number(input.document.valor_total);
    const idMov = await this.nextGenerator(transaction, input.coligada, "T", "IDMOV");
    const now = date(input.integrationAt);
    const movementNature =
      input.document.tipo === "nfe"
        ? await this.nature(
            transaction,
            input.coligada,
            input.purchaseTypeCode,
            input.items[0].cfop,
          )
        : null;
    await this.clone(
      transaction,
      "TMOV",
      "src.CODCOLIGADA=@sourceColigada AND src.IDMOV=@sourceId",
      { sourceColigada: input.coligada, sourceId: templateId },
      {
        IDMOV: idMov,
        CODFILIAL: input.filial,
        CODCFO: supplierCode,
        CODCFOAUX: supplierCode,
        CODCOLCFO: 0,
        CODCOLCFOAUX: 0,
        IDMOVCFO: supplier.IDHISTORICO,
        IDMOVLCTFLUXUS: idMov,
        NUMEROMOV: formattedNumber,
        SERIE: input.document.serie ?? "",
        CHAVEACESSONFE: input.document.chave_acesso,
        DATAEMISSAO: issueDate,
        DATASAIDA: now,
        DATAMOVIMENTO: now,
        DATALANCAMENTO: now,
        DATACRIACAO: now,
        CODTB1FLX: input.financialPlanCode,
        CODCCUSTO: input.costCenterCode,
        IDNAT: movementNature?.header.IDNAT ?? null,
        VALORBRUTO: total,
        VALORLIQUIDO: total,
        VALORBRUTOORIG: total,
        VALORLIQUIDOORIG: total,
        VALORFRETE: number(input.document.valor_frete),
        VALORSEGURO: number(input.document.valor_seguro),
        VALORDESC: number(input.document.valor_desconto),
        VALOROUTROS: number(input.document.valor_outros),
        NUMEROLCTGERADO: 0,
        NUMEROLCTABERTO: 0,
        CODUSUARIO: input.user,
        USUARIOCRIACAO: input.user,
        RECCREATEDBY: input.user,
        RECCREATEDON: now,
        RECMODIFIEDBY: input.user,
        RECMODIFIEDON: now,
      },
    );

    for (const table of ["TMOVCOMPL", "TNFE", "TMOVFISCAL", "TMOVFISCALSERV"] as const) {
      const extra: Overrides = {
        IDMOV: idMov,
        RECCREATEDBY: input.user,
        RECCREATEDON: now,
        RECMODIFIEDBY: input.user,
        RECMODIFIEDON: now,
      };
      if (table === "TNFE" && input.document.tipo === "nfse")
        Object.assign(extra, {
          CODIGOSERVICO: input.document.service_code_municipal ?? null,
          VALORSERVICO: number(input.document.service_gross_value, total),
          BASEDECALCULO: number(input.document.iss_base_value),
          ALIQUOTAISS: number(input.document.iss_rate),
          VALORISS: number(input.document.iss_value),
          NUMERONFE: input.document.numero.slice(-8),
          DATAEMISSAO: issueDate,
          DISCRIMINACAO: input.document.service_description ?? input.document.emitente_nome,
        });
      if (table === "TMOVFISCAL" && input.document.tipo === "nfse")
        Object.assign(extra, {
          NUMERONFSE: input.document.numero,
          DATAEMISSAONFSE: issueDate,
          DATACOMPETENCIANFSE: input.document.competence_date
            ? date(input.document.competence_date)
            : issueDate,
        });
      await this.clone(
        transaction,
        table,
        "src.CODCOLIGADA=@sourceColigada AND src.IDMOV=@sourceId",
        { sourceColigada: input.coligada, sourceId: templateId },
        extra,
      );
    }

    const templateItem = await new sql.Request(transaction)
      .input("coligada", sql.SmallInt, input.coligada)
      .input("templateId", sql.Int, templateId)
      .query<{
        NSEQITMMOV: number;
      }>("SELECT TOP 1 NSEQITMMOV FROM dbo.TITMMOV WHERE CODCOLIGADA=@coligada AND IDMOV=@templateId ORDER BY NSEQITMMOV");
    if (!templateItem.recordset[0])
      throw new Error(`O movimento-modelo ${templateId} não possui item.`);
    let nextItemRate = await this.nextTableValue(transaction, "TITMMOVRATCCU", "IDMOVRATCCU");
    const createdProducts: Array<{ localProductId: string; erpCode: string }> = [];
    for (const item of input.items) {
      const product = await this.resolveProduct(transaction, input, item);
      if (product.created && item.localProductId)
        createdProducts.push({ localProductId: item.localProductId, erpCode: item.productErpCode });
      const itemNature =
        input.document.tipo === "nfe"
          ? await this.nature(transaction, input.coligada, item.purchaseTypeCode, item.cfop)
          : null;
      const itemValue = number(item.valor_total, number(item.valor_bruto));
      const quantity = number(item.quantidade_comercial, 1);
      const unitPrice = number(
        item.valor_unitario_comercial,
        quantity ? itemValue / quantity : itemValue,
      );
      const costCenter = item.costCenterCode ?? input.costCenterCode;
      await this.clone(
        transaction,
        "TITMMOV",
        "src.CODCOLIGADA=@sourceColigada AND src.IDMOV=@sourceId AND src.NSEQITMMOV=@sourceSeq",
        {
          sourceColigada: input.coligada,
          sourceId: templateId,
          sourceSeq: templateItem.recordset[0].NSEQITMMOV,
        },
        {
          IDMOV: idMov,
          NSEQITMMOV: item.numero_item,
          NUMEROSEQUENCIAL: item.numero_item,
          IDPRD: product.IDPRD,
          CODUND: item.unidade_comercial ?? product.CODUNDVENDA,
          QUANTIDADE: quantity,
          QUANTIDADEARECEBER: quantity,
          QUANTIDADEORIGINAL: quantity,
          QUANTIDADETOTAL: quantity,
          PRECOUNITARIO: unitPrice,
          VALORTOTALITEM: itemValue,
          VALORLIQUIDO: itemValue,
          VALORBRUTOITEM: number(item.valor_bruto, itemValue),
          VALORBRUTOITEMORIG: number(item.valor_bruto, itemValue),
          VALORDESC: number(item.valor_desconto),
          RATEIOFRETE: number(item.valor_frete),
          RATEIOSEGURO: number(item.valor_seguro),
          RATEIODESP: number(item.valor_outros),
          CODFILIAL: input.filial,
          CODLOC: item.localEstoqueCode,
          CODCCUSTO: costCenter,
          CODTB1FLX: input.financialPlanCode,
          IDNAT: itemNature?.item.IDNAT ?? null,
          DATAEMISSAO: issueDate,
          RATEIOCCUSTODEPTO: itemValue,
          RECCREATEDBY: input.user,
          RECCREATEDON: now,
          RECMODIFIEDBY: input.user,
          RECMODIFIEDON: now,
        },
      );
      for (const table of ["TITMMOVCOMPL", "TITMMOVFISCAL"] as const)
        await this.clone(
          transaction,
          table,
          "src.CODCOLIGADA=@sourceColigada AND src.IDMOV=@sourceId AND src.NSEQITMMOV=@sourceSeq",
          {
            sourceColigada: input.coligada,
            sourceId: templateId,
            sourceSeq: templateItem.recordset[0].NSEQITMMOV,
          },
          {
            IDMOV: idMov,
            NSEQITMMOV: item.numero_item,
            RECCREATEDBY: input.user,
            RECCREATEDON: now,
            RECMODIFIEDBY: input.user,
            RECMODIFIEDON: now,
          },
        );
      const templateTaxes = await new sql.Request(transaction)
        .input("coligada", sql.SmallInt, input.coligada)
        .input("templateId", sql.Int, templateId)
        .input("templateSeq", sql.Int, templateItem.recordset[0].NSEQITMMOV)
        .query<{
          CODTRB: string;
        }>("SELECT CODTRB FROM dbo.TTRBMOV WHERE CODCOLIGADA=@coligada AND IDMOV=@templateId AND NSEQITMMOV=@templateSeq");
      for (const templateTax of templateTaxes.recordset) {
        const tax = taxValues(item.taxes, templateTax.CODTRB);
        await this.clone(
          transaction,
          "TTRBMOV",
          "src.CODCOLIGADA=@sourceColigada AND src.IDMOV=@sourceId AND src.NSEQITMMOV=@sourceSeq AND src.CODTRB=@sourceTax",
          {
            sourceColigada: input.coligada,
            sourceId: templateId,
            sourceSeq: templateItem.recordset[0].NSEQITMMOV,
            sourceTax: templateTax.CODTRB,
          },
          {
            IDMOV: idMov,
            NSEQITMMOV: item.numero_item,
            BASEDECALCULO: tax.base,
            BASEDECALCULOCALCULADA: tax.base,
            ALIQUOTA: tax.rate,
            VALOR: tax.value,
            SITTRIBUTARIA: tax.cst,
            CODENQIPI: tax.enq,
            RECCREATEDBY: input.user,
            RECCREATEDON: now,
            RECMODIFIEDBY: input.user,
            RECMODIFIEDON: now,
          },
        );
      }
      const itemRates = item.allocations.length
        ? item.allocations
        : costCenter
          ? [{ costCenterCode: costCenter, value: itemValue }]
          : [];
      for (const rate of itemRates)
        await this.clone(
          transaction,
          "TITMMOVRATCCU",
          "src.CODCOLIGADA=@sourceColigada AND src.IDMOV=@sourceId AND src.NSEQITMMOV=@sourceSeq AND src.IDMOVRATCCU=(SELECT MIN(r.IDMOVRATCCU) FROM dbo.TITMMOVRATCCU r WHERE r.CODCOLIGADA=@sourceColigada AND r.IDMOV=@sourceId AND r.NSEQITMMOV=@sourceSeq)",
          {
            sourceColigada: input.coligada,
            sourceId: templateId,
            sourceSeq: templateItem.recordset[0].NSEQITMMOV,
          },
          {
            IDMOV: idMov,
            NSEQITMMOV: item.numero_item,
            CODCCUSTO: rate.costCenterCode,
            VALOR: rate.value,
            IDMOVRATCCU: nextItemRate++,
            RECCREATEDBY: input.user,
            RECCREATEDON: now,
            RECMODIFIEDBY: input.user,
            RECMODIFIEDON: now,
          },
        );
      if (item.codigo)
        await new sql.Request(transaction)
          .input("coligada", sql.SmallInt, input.coligada)
          .input("idPrd", sql.Int, product.IDPRD)
          .input("supplierCode", sql.VarChar, supplierCode)
          .input("supplierProduct", sql.VarChar, item.codigo)
          .input("user", sql.VarChar, input.user).query(`
          IF EXISTS (SELECT 1 FROM dbo.TPRDCFOCOLAB WITH (UPDLOCK,HOLDLOCK) WHERE CODCOLIGADA=@coligada AND CODCOLCFO=0 AND CODCFO=@supplierCode AND CODPRDFORNECEDOR=@supplierProduct)
            UPDATE dbo.TPRDCFOCOLAB SET IDPRD=@idPrd,RECMODIFIEDBY=@user,RECMODIFIEDON=GETDATE() WHERE CODCOLIGADA=@coligada AND CODCOLCFO=0 AND CODCFO=@supplierCode AND CODPRDFORNECEDOR=@supplierProduct;
          ELSE
            INSERT dbo.TPRDCFOCOLAB (CODCOLIGADA,IDPRD,CODCOLCFO,CODCFO,CODPRDFORNECEDOR,RECCREATEDBY,RECCREATEDON,RECMODIFIEDBY,RECMODIFIEDON)
            VALUES (@coligada,@idPrd,0,@supplierCode,@supplierProduct,@user,GETDATE(),@user,GETDATE());
        `);
    }

    const movementRates = input.allocations.length
      ? input.allocations
      : input.costCenterCode
        ? [{ costCenterCode: input.costCenterCode, value: total }]
        : [];
    if (movementRates.length) {
      let rateId = await this.nextTableValue(transaction, "TMOVRATCCU", "IDMOVRATCCU");
      for (const rate of movementRates)
        await this.clone(
          transaction,
          "TMOVRATCCU",
          "src.CODCOLIGADA=@sourceColigada AND src.IDMOV=@sourceId AND src.IDMOVRATCCU=(SELECT MIN(r.IDMOVRATCCU) FROM dbo.TMOVRATCCU r WHERE r.CODCOLIGADA=@sourceColigada AND r.IDMOV=@sourceId)",
          { sourceColigada: input.coligada, sourceId: templateId },
          {
            IDMOV: idMov,
            CODCCUSTO: rate.costCenterCode,
            VALOR: rate.value,
            IDMOVRATCCU: rateId++,
            RECCREATEDBY: input.user,
            RECCREATEDON: now,
            RECMODIFIEDBY: input.user,
            RECMODIFIEDON: now,
          },
        );
    }

    const schedule = installments(input.document.cobranca, total, issueDate);
    let nextFlanId = await this.nextTableValue(transaction, "FLAN", "ID");
    for (let index = 0; index < schedule.length; index += 1) {
      const installment = schedule[index];
      const idLan = await this.nextGenerator(transaction, input.coligada, "F", "IDLAN");
      const documentNumber = `${formattedNumber}/${String(index + 1).padStart(2, "0")}`;
      const financialRows = await this.clone(
        transaction,
        "FLAN",
        "src.CODCOLIGADA=@sourceColigada AND src.IDMOV=@sourceId AND src.IDLAN=(SELECT MIN(IDLAN) FROM dbo.FLAN WHERE CODCOLIGADA=@sourceColigada AND IDMOV=@sourceId)",
        { sourceColigada: input.coligada, sourceId: templateId },
        {
          IDLAN: idLan,
          ID: nextFlanId++,
          IDHISTORICO: supplier.IDHISTORICO,
          IDMOV: idMov,
          NUMERODOCUMENTO: documentNumber,
          CODCFO: supplierCode,
          CODCOLCFO: 0,
          CODFILIAL: input.filial,
          SERIEDOCUMENTO: input.document.serie ?? "",
          DATAEMISSAO: issueDate,
          DATACRIACAO: now,
          DATAVENCIMENTO: installment.due,
          DATAPREVBAIXA: installment.due,
          VALORORIGINAL: installment.value,
          CODCCUSTO: input.costCenterCode,
          CODTB1FLX: input.financialPlanCode,
          USUARIO: input.user,
          USUARIOCRIACAO: input.user,
          RECCREATEDBY: input.user,
          RECCREATEDON: now,
          RECMODIFIEDBY: input.user,
          RECMODIFIEDON: now,
        },
      );
      if (financialRows !== 1)
        throw new Error(
          `O movimento-modelo ${templateId} não possui lançamento FLAN para gerar a parcela ${index + 1}.`,
        );
    }
    await new sql.Request(transaction)
      .input("coligada", sql.SmallInt, input.coligada)
      .input("idMov", sql.Int, idMov)
      .input("count", sql.Int, schedule.length)
      .query(
        "UPDATE dbo.TMOV SET NUMEROLCTGERADO=@count,NUMEROLCTABERTO=@count WHERE CODCOLIGADA=@coligada AND IDMOV=@idMov",
      );
    return {
      idMov,
      codTmv,
      supplierCode,
      itemCount: input.items.length,
      installmentCount: schedule.length,
      alreadyExisted: false,
      createdProducts,
    };
  }
}
