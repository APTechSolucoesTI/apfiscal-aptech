import { Injectable, OnModuleDestroy } from "@nestjs/common";
import * as sql from "mssql";

const MUTATING_SQL = /\b(?:INSERT|UPDATE|DELETE|MERGE|TRUNCATE|DROP|ALTER|CREATE|EXEC(?:UTE)?|GRANT|REVOKE|DENY|BACKUP|RESTORE)\b/i;
const KEY_PATTERN = /^[A-Z][A-Z0-9_]{1,63}$/;

export type TotvsConnectionSummary = { key: string; description: string; database: string | null; configured: boolean; writesEnabled: boolean; coligadas: number[] };
type TotvsConnectionConfig = TotvsConnectionSummary & { host: string | null; port: number; user: string | null; password: string | null; encrypt: boolean; trustServerCertificate: boolean; connectionTimeout: number; requestTimeout: number; poolMax: number };

export function assertReadOnlySql(statement: string): void {
  const normalized = statement.replace(/--.*$/gm, " ").replace(/\/\*[\s\S]*?\*\//g, " ").trim();
  if (!/^SELECT\b/i.test(normalized) || MUTATING_SQL.test(normalized)) throw new Error("A camada de leitura TOTVS recusou um comando que não é SELECT.");
}

export function assertTotvsWriteDatabase(database: string | null): asserts database is "CorporeRM_Teste" {
  if (database !== "CorporeRM_Teste")
    throw new Error(
      `Escrita recusada: a conexão aponta para ${database ?? "um banco não informado"}, não para CorporeRM_Teste.`,
    );
}

const flag = (value: string | undefined, fallback: boolean) => value?.trim() ? ["1", "true", "yes", "on"].includes(value.trim().toLowerCase()) : fallback;
const coligadas = (value: string | undefined) => [...new Set((value ?? "1,2").split(",").map((item) => Number(item.trim())).filter((item) => Number.isInteger(item) && item > 0))];
function normalizeKey(value: string | undefined, fallback = "TOTVS_GRANJA") {
  const key = (value?.trim() || fallback).toUpperCase();
  if (!KEY_PATTERN.test(key)) throw new Error(`Chave de conexão TOTVS inválida: ${key}.`);
  return key;
}

@Injectable()
export class TotvsSqlServerService implements OnModuleDestroy {
  private readonly pools = new Map<string, Promise<sql.ConnectionPool>>();

  defaultKey() { return normalizeKey(process.env.TOTVS_DEFAULT_CONNECTION_KEY ?? process.env.TOTVS_CONNECTION_KEY); }

  connectionKeys() {
    const keys = (process.env.TOTVS_CONNECTION_KEYS ?? "").split(",").map((item) => item.trim()).filter(Boolean).map((item) => normalizeKey(item));
    if (this.legacyConfigured() || keys.length === 0) keys.unshift(this.defaultKey());
    return [...new Set(keys)];
  }

  connections(): TotvsConnectionSummary[] {
    return this.connectionKeys().map((key) => {
      const config = this.config(key);
      return { key, description: config.description, database: config.database, configured: config.configured, writesEnabled: config.writesEnabled, coligadas: config.coligadas };
    });
  }

  configured(key = this.defaultKey()) { return this.config(key).configured; }
  writesEnabled(key = this.defaultKey()) { return this.config(key).writesEnabled; }
  coligadas(key = this.defaultKey()) {
    const values = this.config(key).coligadas;
    if (!values.length) throw new Error(`A conexão ${key} deve permitir ao menos uma coligada numérica.`);
    return values;
  }

  private legacyConfigured() {
    return ["TOTVS_SQL_HOST", "TOTVS_SQL_DATABASE", "TOTVS_SQL_USER", "TOTVS_SQL_PASSWORD"].every((name) => Boolean(process.env[name]?.trim()));
  }

  private config(keyInput: string): TotvsConnectionConfig {
    const key = normalizeKey(keyInput);
    const prefix = `TOTVS_CONNECTION_${key}_`;
    const isDefault = key === this.defaultKey();
    const get = (suffix: string, legacy?: string) => process.env[`${prefix}${suffix}`]?.trim() || (isDefault && legacy ? process.env[legacy]?.trim() : undefined);
    const host = get("HOST", "TOTVS_SQL_HOST") || null;
    const database = get("DATABASE", "TOTVS_SQL_DATABASE") || null;
    const user = get("USER", "TOTVS_SQL_USER") || null;
    const password = get("PASSWORD", "TOTVS_SQL_PASSWORD") || null;
    return {
      key, host, database, user, password,
      description: get("DESCRIPTION", "TOTVS_CONNECTION_DESCRIPTION") || key.replaceAll("_", " "),
      configured: Boolean(host && database && user && password),
      port: Number(get("PORT", "TOTVS_SQL_PORT") || 1433),
      encrypt: flag(get("ENCRYPT", "TOTVS_SQL_ENCRYPT"), true),
      trustServerCertificate: flag(get("TRUST_SERVER_CERTIFICATE", "TOTVS_SQL_TRUST_SERVER_CERTIFICATE"), false),
      connectionTimeout: Number(get("CONNECTION_TIMEOUT_MS", "TOTVS_SQL_CONNECTION_TIMEOUT_MS") || 15_000),
      requestTimeout: Number(get("REQUEST_TIMEOUT_MS", "TOTVS_SQL_REQUEST_TIMEOUT_MS") || 60_000),
      poolMax: Number(get("POOL_MAX", "TOTVS_SQL_POOL_MAX") || 5),
      writesEnabled: flag(get("WRITES_ENABLED", "TOTVS_WRITES_ENABLED"), false),
      coligadas: coligadas(get("COLIGADAS", "TOTVS_COLIGADAS")),
    };
  }

  private pool(keyInput: string): Promise<sql.ConnectionPool> {
    const config = this.config(keyInput);
    if (!config.configured || !config.host || !config.database || !config.user || !config.password) throw new Error(`Credenciais ausentes para a conexão TOTVS ${config.key}.`);
    const current = this.pools.get(config.key);
    if (current) return current;
    const promise = new sql.ConnectionPool({
      server: config.host, port: config.port, database: config.database, user: config.user, password: config.password,
      connectionTimeout: config.connectionTimeout, requestTimeout: config.requestTimeout,
      pool: { max: config.poolMax, min: 0, idleTimeoutMillis: 30_000 },
      options: { encrypt: config.encrypt, trustServerCertificate: config.trustServerCertificate, appName: `APFiscal-${config.key}-ReadOnly`, abortTransactionOnError: true },
    }).connect().catch((error) => { this.pools.delete(config.key); throw error; });
    this.pools.set(config.key, promise);
    return promise;
  }

  async testConnection(key = this.defaultKey()): Promise<{ ok: true; key: string; description: string; database: string }> {
    const result = await this.queryReadOnly<{ ok: number; database_name: string }>("SELECT 1 AS ok, DB_NAME() AS database_name", {}, key);
    if (result[0]?.ok !== 1) throw new Error("O SQL Server respondeu de forma inesperada ao SELECT 1.");
    return { ok: true, key, description: this.config(key).description, database: result[0].database_name };
  }

  async queryReadOnly<T extends Record<string, unknown>>(statement: string, parameters: { since?: Date } = {}, key = this.defaultKey()): Promise<T[]> {
    assertReadOnlySql(statement);
    const request = (await this.pool(key)).request();
    if (parameters.since) request.input("since", sql.DateTime2, parameters.since);
    return (await request.query<T>(statement)).recordset;
  }

  assertWritesEnabled(key = this.defaultKey()) {
    const config = this.config(key);
    if (!config.writesEnabled) throw new Error(`Escritas no TOTVS RM estão bloqueadas para ${key}.`);
    assertTotvsWriteDatabase(config.database);
  }

  async writeTransaction<T>(key: string, work: (transaction: sql.Transaction) => Promise<T>): Promise<T> {
    this.assertWritesEnabled(key);
    const pool = await this.pool(key);
    const transaction = new sql.Transaction(pool);
    await transaction.begin(sql.ISOLATION_LEVEL.SERIALIZABLE);
    try {
      const target = await new sql.Request(transaction).query<{ database_name: string }>(
        "SELECT DB_NAME() AS database_name",
      );
      assertTotvsWriteDatabase(target.recordset[0]?.database_name ?? null);
      const result = await work(transaction);
      await transaction.commit();
      return result;
    } catch (error) {
      await transaction.rollback().catch(() => undefined);
      throw error;
    }
  }

  async onModuleDestroy() {
    const pools = await Promise.all([...this.pools.values()].map((pool) => pool.catch(() => null)));
    await Promise.all(pools.map((pool) => pool?.close()));
    this.pools.clear();
  }
}
