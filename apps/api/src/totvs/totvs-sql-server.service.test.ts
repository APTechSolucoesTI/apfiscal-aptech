import { describe, expect, it } from "vitest";
import { assertReadOnlySql } from "./totvs-sql-server.service";
import { TOTVS_PENDING_SCHEMA_ENTITIES, TOTVS_READ_QUERIES } from "./totvs-queries";

describe("TOTVS SQL read-only guard", () => {
  it("accepts SELECT statements", () => expect(() => assertReadOnlySql("SELECT 1 AS ok")).not.toThrow());

  it.each(["UPDATE FCFO SET NOME='X'", "DELETE FROM FCFO", "EXEC PRC_IMPORTA_NFE", "SELECT 1; DROP TABLE FCFO"])(
    "rejects mutating SQL: %s",
    (statement) => expect(() => assertReadOnlySql(statement)).toThrow(/recusou/),
  );

  it("keeps every legacy synchronization query read-only", () => {
    expect(TOTVS_READ_QUERIES.map((definition) => definition.entity)).toContain("products");
    expect(TOTVS_READ_QUERIES.map((definition) => definition.entity)).toContain("financial_plan");
    expect(TOTVS_PENDING_SCHEMA_ENTITIES).toEqual(["stock_locations"]);

    for (const definition of TOTVS_READ_QUERIES) {
      expect(() => assertReadOnlySql(definition.sql("1,2"))).not.toThrow();
    }
  });
});
