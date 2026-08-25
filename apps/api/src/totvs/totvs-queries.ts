export type TotvsEntity =
  | "representatives"
  | "customer_categories"
  | "suppliers"
  | "supplier_addresses"
  | "countries"
  | "states"
  | "cities"
  | "supplier_contacts"
  | "transporters"
  | "cost_centers"
  | "payment_conditions"
  | "supplier_defaults"
  | "product_classifications"
  | "products"
  | "financial_plan"
  | "stock_locations";

export type TotvsQueryDefinition = {
  entity: TotvsEntity;
  incremental: boolean;
  updatedAtField?: string;
  externalKey(row: Record<string, unknown>): string;
  displayName(row: Record<string, unknown>): string | null;
  filialAware?: boolean;
  sql(coligadas: string): string;
};

const text = (value: unknown) => String(value ?? "").trim();
const composite = (...parts: unknown[]) => parts.map(text).join("|");

export const TOTVS_READ_QUERIES: readonly TotvsQueryDefinition[] = [
  {
    entity: "representatives", incremental: false,
    externalKey: (row) => composite(row.codcoligada, row.codigo), displayName: (row) => text(row.razao_social) || null,
    sql: (c) => `SELECT R.CODCOLIGADA AS codcoligada, R.CODRPR AS codigo, UPPER(R.NOME) AS razao_social,
      R.NOMEFANTASIA AS fantasia, R.CGC AS cpf_cnpj, R.INSCRESTADUAL AS ie, R.RUA AS rua,
      R.NUMERO AS numero, R.COMPLEMENTO AS complemento, R.BAIRRO AS bairro, R.CIDADE AS cidade,
      R.CODETD AS estado, R.CEP AS cep, R.CONTATO AS contato, R.TELEFONE AS telefone, R.FAX AS fax,
      R.PERCENTCOMISSAO AS comissao, R.FATCLIENTEDIRETO AS faturamento_direto,
      CASE WHEN R.INATIVO = 0 THEN 'S' ELSE 'N' END AS ativo, R.EMAIL AS email, R.CELULAR AS celular, R.PAIS AS pais
      FROM TRPR R WHERE R.CODCOLIGADA IN (${c})`,
  },
  {
    entity: "customer_categories", incremental: false,
    externalKey: (row) => text(row.codigo), displayName: (row) => text(row.nome) || null,
    sql: () => "SELECT CODTCF AS codigo, DESCRICAO AS nome FROM FTCF",
  },
  {
    entity: "suppliers", incremental: true, updatedAtField: "source_updated_at",
    externalKey: (row) => composite(row.coligada, row.codigo), displayName: (row) => text(row.razao_social) || null,
    sql: (c) => `SELECT CODCOLIGADA AS coligada, CODCFO AS codigo, NOMEFANTASIA AS fantasia,
      UPPER(NOME) AS razao_social, CGCCFO AS cpf_cnpj, INSCRESTADUAL AS ie,
      CASE WHEN PESSOAFISOUJUR = 'F' THEN 1 WHEN PESSOAFISOUJUR = 'J' THEN 2 END AS tipo_pessoa_id,
      CODTCF AS categoria, TELEFONE AS telefone, EMAIL AS email, CONTATO AS contato,
      DATAULTALTERACAO AS source_updated_at, CASE WHEN ATIVO = 1 THEN 'S' ELSE 'N' END AS ativo,
      CASE WHEN CFOIMOB = 1 THEN 'S' ELSE 'N' END AS bloqueado
      FROM FCFO WHERE PAGREC <> 2 AND CGCCFO IS NOT NULL AND CODCOLIGADA IN (${c})
      AND DATAULTALTERACAO >= @since`,
  },
  {
    entity: "supplier_addresses", incremental: true, updatedAtField: "source_updated_at",
    externalKey: (row) => composite(row.coligada, row.codigo, row.tipo), displayName: (row) => text(row.tipo) || null,
    sql: (c) => `SELECT CODCOLIGADA AS coligada, 'Principal' AS tipo, CODCFO AS codigo, RUA AS rua,
      NUMERO AS numero, COMPLEMENTO AS complemento, BAIRRO AS bairro, UPPER(CIDADE) AS cidade,
      CODMUNICIPIO AS cod_municipio, CODETD AS uf, CEP AS cep, DATAULTALTERACAO AS source_updated_at
      FROM FCFO WHERE CODCFO IS NOT NULL AND PAGREC <> 2 AND CGCCFO IS NOT NULL AND CODCOLIGADA IN (${c}) AND DATAULTALTERACAO >= @since
      UNION ALL SELECT CODCOLIGADA, 'Pagamento', CODCFO, RUAPGTO, NUMEROPGTO, COMPLEMENTOPGTO,
      BAIRROPGTO, UPPER(CIDADEPGTO), CODMUNICIPIOPGTO, CODETDPGTO, CEPPGTO, DATAULTALTERACAO
      FROM FCFO WHERE CODCFO IS NOT NULL AND PAGREC <> 2 AND CGCCFO IS NOT NULL AND CODCOLIGADA IN (${c}) AND DATAULTALTERACAO >= @since
      UNION ALL SELECT CODCOLIGADA, 'Entrega', CODCFO, RUAENTREGA, NUMEROENTREGA, COMPLEMENTREGA,
      BAIRROENTREGA, UPPER(CIDADEENTREGA), CODMUNICIPIOENTREGA, CODETDENTREGA, CEPENTREGA, DATAULTALTERACAO
      FROM FCFO WHERE CODCFO IS NOT NULL AND PAGREC <> 2 AND CGCCFO IS NOT NULL AND CODCOLIGADA IN (${c}) AND DATAULTALTERACAO >= @since`,
  },
  {
    entity: "countries", incremental: false,
    externalKey: (row) => text(row.codigo), displayName: (row) => text(row.nome) || null,
    sql: () => "SELECT P.CODPAIS AS codigo, P.DESCRICAO AS nome FROM GPAIS P",
  },
  {
    entity: "states", incremental: false,
    externalKey: (row) => text(row.sigla), displayName: (row) => text(row.nome) || null,
    sql: () => `SELECT E.CODETD AS sigla, E.NOME AS nome, E.CODIGOSINIEF AS codigo, P.CODPAIS AS codigo_pais
      FROM GETD E INNER JOIN GPAIS P ON E.IDPAIS = P.IDPAIS`,
  },
  {
    entity: "cities", incremental: false,
    externalKey: (row) => composite(row.estado, row.codigo), displayName: (row) => text(row.nome) || null,
    sql: () => `SELECT UPPER(TRIM(C.NOMEMUNICIPIO)) AS nome, TRIM(C.CODMUNICIPIO) AS codigo,
      TRIM(D.CODIGO) AS codigo_ibge, TRIM(C.CODETDMUNICIPIO) AS estado
      FROM GMUNICIPIO C LEFT JOIN DCODIFICACAOMUNICIPIO D ON C.CODMUNICIPIO = D.CODMUNICIPIO
      AND C.CODETDMUNICIPIO = D.CODETDMUNICIPIO WHERE D.IDCLASSIFMUNICIPIO = 1`,
  },
  {
    entity: "supplier_contacts", incremental: true, updatedAtField: "source_updated_at",
    externalKey: (row) => composite(row.coligada, row.codigo, row.id_contato), displayName: (row) => text(row.nome) || null,
    sql: (c) => `SELECT C.CODCOLIGADA AS coligada, C.CODCFO AS codigo, C.NOME AS nome, C.EMAIL AS email,
      C.TELEFONE AS telefone, C.FUNCAO AS funcao, C.IDCONTATO AS id_contato, C.DATAALTERACAO AS source_updated_at
      FROM FCFOCONTATO C INNER JOIN FCFO F ON C.CODCFO = F.CODCFO AND C.CODCOLIGADA = F.CODCOLIGADA
      AND F.PAGREC <> 2 WHERE C.CODCOLIGADA IN (${c}) AND C.DATAALTERACAO >= @since`,
  },
  {
    entity: "transporters", incremental: false,
    externalKey: (row) => composite(row.coligada, row.codigo), displayName: (row) => text(row.nome) || null,
    sql: (c) => `SELECT CODCOLIGADA AS coligada, CODTRA AS codigo, UPPER(NOME) AS nome, RUA AS rua,
      NUMERO AS numero, COMPLEMENTO AS complemento, BAIRRO AS bairro, CODMUNICIPIO AS cidade,
      CEP AS cep, TRIM(CGC) AS cpf_cnpj, INSCRESTADUAL AS ie, CONTATO AS contato, TELEFONE AS telefone,
      TELEX AS telex, FAX AS fax, LIVRE AS livre, NOMEFANTASIA AS fantasia, CEI AS cei,
      INSCRMUNICIPAL AS inscricao_municipal, CASE WHEN INATIVO = 0 THEN 'S' ELSE 'N' END AS ativo, EMAIL AS email
      FROM TTRA WHERE CGC IS NOT NULL AND CODCOLIGADA IN (${c})`,
  },
  {
    entity: "cost_centers", incremental: false,
    externalKey: (row) => composite(row.coligada, row.codigo), displayName: (row) => text(row.nome) || null,
    sql: (c) => `SELECT CODCOLIGADA AS coligada, CODCCUSTO AS codigo, NOME AS nome,
      CASE WHEN ATIVO = 'T' THEN 'S' ELSE 'N' END AS ativo FROM GCCUSTO WHERE CODCOLIGADA IN (${c})`,
  },
  {
    entity: "payment_conditions", incremental: false,
    externalKey: (row) => composite(row.coligada, row.codigo), displayName: (row) => text(row.nome) || null,
    sql: (c) => `SELECT CODCOLIGADA AS coligada, CODCPG AS codigo, NOME AS nome,
      CASE WHEN INATIVO = 0 THEN 'S' ELSE 'N' END AS ativo FROM TCPG WHERE CODCOLIGADA IN (${c})`,
  },
  {
    entity: "supplier_defaults", incremental: true, updatedAtField: "source_updated_at",
    externalKey: (row) => composite(row.coligada, row.cliente), displayName: () => null,
    sql: (c) => `SELECT CODCOLIGADA AS coligada, CODRPR AS representante, CODTRA AS transportadora,
      CODTRA2 AS transportadora2, CODCFO AS cliente, CODVEN AS vendedor, CIFFOB AS frete,
      RECMODIFIEDON AS source_updated_at FROM FCFODEF WHERE CODCFO IS NOT NULL
      AND CODCOLIGADA IN (${c}) AND RECMODIFIEDON >= @since`,
  },
  {
    entity: "product_classifications", incremental: false,
    externalKey: (row) => composite(row.coligada, row.id_product), displayName: (row) => text(row.description) || null,
    sql: (c) => `SELECT CODCOLPRD AS coligada, IDPRD AS id_product, CODIGOPRD AS code,
      DESCRICAO AS description, ULTIMONIVEL AS last_level, DATAULTALTERACAO AS source_updated_at
      FROM TPRODUTO WHERE CODCOLPRD IN (${c}) AND ULTIMONIVEL = 0`,
  },
  {
    entity: "products", incremental: true, updatedAtField: "source_updated_at",
    externalKey: (row) => composite(row.coligada, row.id_product), displayName: (row) => text(row.description) || null,
    sql: (c) => `SELECT P.CODCOLPRD AS coligada, P.IDPRD AS id_product, P.CODIGOPRD AS code,
      P.NOMEFANTASIA AS fantasy_name, P.CODIGOREDUZIDO AS reduced_code, P.TIPO AS product_type,
      P.DESCRICAO AS description, P.DESCRICAOAUX AS auxiliary_description, P.CODIGOAUXILIAR AS auxiliary_code,
      P.PESOLIQUIDO AS net_weight, P.PESOBRUTO AS gross_weight, P.OBSERVACAO AS notes,
      P.INATIVO AS inactive,
      (SELECT MAX(updated_at) FROM (VALUES (P.DATAULTALTERACAO), (D.RECMODIFIEDON), (N.RECMODIFIEDON)) AS updates(updated_at)) AS source_updated_at,
      N.NCM AS ncm,
      P.INDICADORORIGEM AS origin_indicator, P.CODBARRASEXTERIOR AS external_barcode,
      P.CONTROLADOPORLOTE AS lot_controlled, P.USANUMSERIE AS uses_serial_number,
      D.CODFAB AS manufacturer_code, D.CODUNDVENDA AS sales_unit, D.CODUNDCOMPRA AS purchase_unit,
      D.CODUNDCONTROLE AS control_unit, D.PRECO1 AS price_1, D.CUSTOMEDIO AS average_cost,
      D.CUSTOUNITARIO AS unit_cost, D.CUSTOREPOSICAO AS replacement_cost,
      D.CODCPG AS payment_condition, D.CODCONTAGER AS management_account,
      D.CODCOLCONTAGER AS management_account_coligada, D.SALDOGERALFISICO AS physical_balance,
      D.SALDOGERALFINANC AS financial_balance, D.RECMODIFIEDON AS definition_updated_at
      FROM TPRODUTO P LEFT JOIN TPRODUTODEF D ON D.CODCOLIGADA = P.CODCOLPRD AND D.IDPRD = P.IDPRD
      LEFT JOIN DTIPI N ON N.IDNCM = P.IDNCM
      WHERE P.CODCOLPRD IN (${c}) AND P.ULTIMONIVEL = 1
      AND (P.DATAULTALTERACAO >= @since OR D.RECMODIFIEDON >= @since OR N.RECMODIFIEDON >= @since)`,
  },
  {
    entity: "financial_plan", incremental: false,
    externalKey: (row) => text(row.code), displayName: (row) => text(row.description) || null,
    sql: () => "SELECT CODTB1FLX AS code, DESCRICAO AS description FROM FTB1",
  },
  {
    entity: "stock_locations", incremental: false,
    filialAware: true,
    externalKey: (row) => composite(row.coligada, row.filial, row.code), displayName: (row) => text(row.description) || null,
    sql: (c) => `SELECT CODCOLIGADA AS coligada, CODFILIAL AS filial, CODLOC AS code,
      NOME AS description, NIVELESTOQUE AS stock_level, IDUNDNEGOCIO AS business_unit_id,
      RUA AS street, COMPLEMENTO AS complement, BAIRRO AS district, CIDADE AS city,
      CEP AS postal_code, CONTATO AS contact, DDD AS area_code, TELEFONE AS phone,
      EMAIL AS email, CODETD AS state, NUMERO AS number, PAIS AS country,
      INATIVO AS inactive, RECMODIFIEDON AS source_updated_at
      FROM TLOC WHERE CODCOLIGADA IN (${c})`,
  },
] as const;

export const TOTVS_PENDING_SCHEMA_ENTITIES: readonly string[] = [];
