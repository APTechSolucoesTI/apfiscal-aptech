import { Injectable, OnModuleDestroy } from "@nestjs/common";
import * as sql from "mssql";

const MUTATING_SQL = /\b(?:INSERT|UPDATE|DELETE|MERGE|TRUNCATE|DROP|ALTER|CREATE|EXEC(?:UTE)?|GRANT|REVOKE|DENY|BACKUP|RESTORE)\b/i;

export function assertReadOnlySql(statement: string): void {
  const normalized = statement.replace(/--.*$/gm, " ").replace(/\/\*[\s\S]*?\*\//g, " ").trim();
  if (!/^SELECT\b/i.test(normalized) || MUTATING_SQL.test(normalized)) {
    throw new Error("A camada de leitura TOTVS recusou um comando que não é SELECT.");
  }
}

function required(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Variável obrigatória ausente para o TOTVS RM: ${name}`);
  return value;
}

function boolean(name: string, fallback: boolean): boolean {
  const value = process.env[name]?.trim().toLowerCase();
  if (!value) return fallback;
  return ["1", "true", "yes", "on"].includes(value);
}

@Injectable()
export class TotvsSqlServerService implements OnModuleDestroy {
  private poolPromise: Promise<sql.ConnectionPool> | null = null;

  configured(): boolean {
    return ["TOTVS_SQL_HOST", "TOTVS_SQL_DATABASE", "TOTVS_SQL_USER", "TOTVS_SQL_PASSWORD"]
      .every((name) => Boolean(process.env[name]?.trim()));
  }

  writesEnabled(): boolean {
    return boolean("TOTVS_WRITES_ENABLED", false);
  }

  coligadas(): number[] {
    const values = (process.env.TOTVS_COLIGADAS ?? "1,2").split(",")
      .map((value) => Number(value.trim()))
      .filter((value) => Number.isInteger(value) && value > 0);
    if (values.length === 0) throw new Error("TOTVS_COLIGADAS deve conter ao menos uma coligada numérica.");
    return [...new Set(values)];
  }

  private pool(): Promise<sql.ConnectionPool> {
    if (!this.poolPromise) {
      const pool = new sql.ConnectionPool({
        server: required("TOTVS_SQL_HOST"),
        port: Number(process.env.TOTVS_SQL_PORT ?? 1433),
        database: required("TOTVS_SQL_DATABASE"),
        user: required("TOTVS_SQL_USER"),
        password: required("TOTVS_SQL_PASSWORD"),
        connectionTimeout: Number(process.env.TOTVS_SQL_CONNECTION_TIMEOUT_MS ?? 15_000),
        requestTimeout: Number(process.env.TOTVS_SQL_REQUEST_TIMEOUT_MS ?? 60_000),
        pool: { max: Number(process.env.TOTVS_SQL_POOL_MAX ?? 5), min: 0, idleTimeoutMillis: 30_000 },
        options: {
          encrypt: boolean("TOTVS_SQL_ENCRYPT", true),
          trustServerCertificate: boolean("TOTVS_SQL_TRUST_SERVER_CERTIFICATE", false),
          appName: "APFiscal-TOTVS-ReadOnly",
          abortTransactionOnError: true,
        },
      });
      pool.on("error", () => undefined);
      this.poolPromise = pool.connect().catch((error) => {
        this.poolPromise = null;
        throw error;
      });
    }
    return this.poolPromise;
  }

  async testConnection(): Promise<{ ok: true; database: string }> {
    const result = await this.queryReadOnly<{ ok: number; database_name: string }>("SELECT 1 AS ok, DB_NAME() AS database_name");
    if (result[0]?.ok !== 1) throw new Error("O SQL Server respondeu de forma inesperada ao SELECT 1.");
    return { ok: true, database: result[0].database_name };
  }

  async queryReadOnly<T extends Record<string, unknown>>(statement: string, parameters: { since?: Date } = {}): Promise<T[]> {
    assertReadOnlySql(statement);
    const connection = await this.pool();
    const request = connection.request();
    if (parameters.since) request.input("since", sql.DateTime2, parameters.since);
    const result = await request.query<T>(statement);
    return result.recordset;
  }

  assertWritesEnabled(): void {
    if (!this.writesEnabled()) {
      throw new Error("Escritas no TOTVS RM estão bloqueadas por TOTVS_WRITES_ENABLED=false.");
    }
  }

  async onModuleDestroy() {
    if (!this.poolPromise) return;
    const pool = await this.poolPromise.catch(() => null);
    if (pool) await pool.close();
    this.poolPromise = null;
  }
}
