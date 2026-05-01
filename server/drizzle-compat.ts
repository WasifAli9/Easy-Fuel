import { and, asc, count, desc, eq, gt, gte, ilike, inArray, isNotNull, isNull, like, lt, lte, ne } from "drizzle-orm";
import * as schema from "@shared/schema";
import type { db } from "./db";

type DB = typeof db;
type Predicate = { kind: string; column: string; value?: any; second?: any; operator?: string };

function toSnakeCase(value: string) {
  return value.replace(/([A-Z])/g, "_$1").toLowerCase();
}

function toCamelCase(value: string) {
  return value.replace(/_([a-z])/g, (_, c) => c.toUpperCase());
}

function getTable(tableName: string): any {
  const table = (schema as Record<string, any>)[tableName];
  if (table) return table;
  const camel = tableName.replace(/_([a-z])/g, (_, c) => c.toUpperCase());
  return (schema as Record<string, any>)[camel];
}

function getColumn(table: any, columnName: string): any {
  if (!table) return undefined;
  const camel = columnName.replace(/_([a-z])/g, (_, c) => c.toUpperCase());
  return table[columnName] ?? table[camel];
}

function getColumnEntry(table: any, columnName: string): [string, any] | null {
  if (!table) return null;
  const entries = Object.entries(table) as Array<[string, any]>;
  const direct = entries.find(([key]) => key === columnName);
  if (direct) return direct;
  const camel = columnName.replace(/_([a-z])/g, (_, c) => c.toUpperCase());
  const byCamel = entries.find(([key]) => key === camel);
  if (byCamel) return byCamel;
  const byDbName = entries.find(([, col]) => col?.name === columnName);
  return byDbName ?? null;
}

function mapDataToTableShape(table: any, payload: Record<string, any>) {
  const mapped: Record<string, any> = {};
  for (const [key, value] of Object.entries(payload ?? {})) {
    const entry = getColumnEntry(table, key);
    if (!entry) continue;
    mapped[entry[0]] = value;
  }
  return mapped;
}

function mapRowToCompatShape(table: any, row: Record<string, any>) {
  const out: Record<string, any> = { ...(row ?? {}) };
  if (!row || typeof row !== "object" || !table) return out;
  const entries = Object.entries(table) as Array<[string, any]>;
  for (const [tableKey, column] of entries) {
    if (!column || typeof column !== "object" || !column.name) continue;
    const dbName = String(column.name);
    const camelKey = tableKey;
    const snakeKey = toSnakeCase(camelKey);

    const value =
      row[camelKey] ??
      row[dbName] ??
      row[snakeKey] ??
      row[toCamelCase(dbName)];
    if (value === undefined) continue;

    // Preserve both casing styles to keep legacy callers stable.
    out[camelKey] = value;
    out[dbName] = value;
    out[snakeKey] = value;
  }
  return out;
}

function mapPayloadToCompatShape(table: any, payload: any) {
  if (Array.isArray(payload)) return payload.map((row) => mapRowToCompatShape(table, row ?? {}));
  if (payload && typeof payload === "object") return mapRowToCompatShape(table, payload);
  return payload;
}

class Builder {
  private op: "select" | "insert" | "update" | "delete" = "select";
  private predicates: Predicate[] = [];
  private orderBySpec: { column: string; ascending: boolean } | null = null;
  private rowLimit?: number;
  private valuesPayload: any = null;
  private selected = "*";
  private countExact = false;
  private countHead = false;

  constructor(private database: DB, private tableName: string) {}

  select(columns?: string, options?: any) {
    this.op = "select";
    this.selected = columns ?? "*";
    this.countExact = options?.count === "exact";
    this.countHead = Boolean(options?.head);
    return this;
  }

  insert(values: any) {
    this.op = "insert";
    this.valuesPayload = values;
    return this;
  }

  update(values: any) {
    this.op = "update";
    this.valuesPayload = values;
    return this;
  }

  delete() {
    this.op = "delete";
    return this;
  }

  eq(column: string, value: any) { this.predicates.push({ kind: "eq", column, value }); return this; }
  neq(column: string, value: any) { this.predicates.push({ kind: "neq", column, value }); return this; }
  gt(column: string, value: any) { this.predicates.push({ kind: "gt", column, value }); return this; }
  gte(column: string, value: any) { this.predicates.push({ kind: "gte", column, value }); return this; }
  lt(column: string, value: any) { this.predicates.push({ kind: "lt", column, value }); return this; }
  lte(column: string, value: any) { this.predicates.push({ kind: "lte", column, value }); return this; }
  like(column: string, value: any) { this.predicates.push({ kind: "like", column, value }); return this; }
  ilike(column: string, value: any) { this.predicates.push({ kind: "ilike", column, value }); return this; }
  in(column: string, values: any[]) { this.predicates.push({ kind: "in", column, value: values }); return this; }
  is(column: string, value: any) { this.predicates.push({ kind: "is", column, value }); return this; }
  not(column: string, operator: string, value: any) { this.predicates.push({ kind: "not", column, operator, value }); return this; }
  order(column: string, opts?: { ascending?: boolean }) { this.orderBySpec = { column, ascending: opts?.ascending !== false }; return this; }
  limit(n: number) { this.rowLimit = n; return this; }
  range(from: number, to: number) { this.rowLimit = Math.max(0, to - from + 1); return this; }
  single() { return this.execute(true, false); }
  maybeSingle() { return this.execute(true, true); }
  async then(resolve: any, reject: any) { return this.execute(false, false).then(resolve, reject); }

  private buildWhere(table: any) {
    const clauses: any[] = [];
    for (const p of this.predicates) {
      const col = getColumn(table, p.column);
      if (!col) continue;
      if (p.kind === "eq") clauses.push(eq(col, p.value));
      if (p.kind === "neq") clauses.push(ne(col, p.value));
      if (p.kind === "gt") clauses.push(gt(col, p.value));
      if (p.kind === "gte") clauses.push(gte(col, p.value));
      if (p.kind === "lt") clauses.push(lt(col, p.value));
      if (p.kind === "lte") clauses.push(lte(col, p.value));
      if (p.kind === "like") clauses.push(like(col, p.value));
      if (p.kind === "ilike") clauses.push(ilike(col, p.value));
      if (p.kind === "in" && Array.isArray(p.value)) clauses.push(inArray(col, p.value));
      if (p.kind === "is") clauses.push(p.value === null ? isNull(col) : isNotNull(col));
      if (p.kind === "not") {
        if (p.operator === "is" && p.value === null) clauses.push(isNotNull(col));
      }
    }
    if (clauses.length === 0) return undefined;
    return clauses.length === 1 ? clauses[0] : and(...clauses);
  }

  private async execute(single: boolean, maybeSingle: boolean) {
    try {
      const table = getTable(this.tableName);
      if (!table) return { data: maybeSingle ? null : [], error: new Error(`Unknown table: ${this.tableName}`), count: null };
      const whereClause = this.buildWhere(table);

      if (this.op === "insert") {
        const rawRows = Array.isArray(this.valuesPayload) ? this.valuesPayload : [this.valuesPayload];
        const rows = rawRows.map((row) => mapDataToTableShape(table, row ?? {}));
        const data = await this.database.insert(table).values(rows as any).returning();
        const payload = single ? (data[0] ?? null) : data;
        const normalizedPayload = mapPayloadToCompatShape(table, payload);
        return { data: normalizedPayload, error: null, count: Array.isArray(data) ? data.length : 0 };
      }

      if (this.op === "update") {
        const mappedValues = mapDataToTableShape(table, this.valuesPayload ?? {});
        let q = this.database.update(table).set(mappedValues as any);
        if (whereClause) q = q.where(whereClause) as any;
        const data = await (q as any).returning();
        const payload = single ? (data[0] ?? null) : data;
        const normalizedPayload = mapPayloadToCompatShape(table, payload);
        return { data: normalizedPayload, error: null, count: Array.isArray(data) ? data.length : 0 };
      }

      if (this.op === "delete") {
        let q = this.database.delete(table);
        if (whereClause) q = q.where(whereClause) as any;
        const data = await (q as any).returning();
        const payload = single ? (data[0] ?? null) : data;
        const normalizedPayload = mapPayloadToCompatShape(table, payload);
        return { data: normalizedPayload, error: null, count: Array.isArray(data) ? data.length : 0 };
      }

      if (this.countExact && this.countHead) {
        let cq = this.database.select({ value: count() }).from(table);
        if (whereClause) cq = cq.where(whereClause) as any;
        const rows = await cq;
        return { data: null, error: null, count: Number(rows[0]?.value ?? 0) };
      }

      let q = this.database.select().from(table);
      if (whereClause) q = q.where(whereClause) as any;
      if (this.orderBySpec) {
        const col = getColumn(table, this.orderBySpec.column);
        if (col) q = q.orderBy(this.orderBySpec.ascending ? asc(col) : desc(col)) as any;
      }
      if (typeof this.rowLimit === "number") q = q.limit(this.rowLimit) as any;
      const data = await q;
      const normalizedData = mapPayloadToCompatShape(table, data) as any[];
      if (single) {
        if (normalizedData.length === 0) return { data: maybeSingle ? null : null, error: maybeSingle ? null : new Error("No rows found"), count: 0 };
        return { data: normalizedData[0], error: null, count: normalizedData.length };
      }
      return { data: normalizedData, error: null, count: normalizedData.length };
    } catch (error: any) {
      return { data: single ? null : [], error, count: null };
    }
  }
}

export function createDrizzleCompat(database: DB) {
  return {
    from(tableName: string) {
      return new Builder(database, tableName);
    },
    auth: {
      admin: {
        async getUserById(userId: string) {
          const table = getTable("profiles");
          if (!table) return { data: { user: null }, error: new Error("profiles table unavailable") };
          const rows = await database.select().from(table).where(eq((table as any).id, userId)).limit(1);
          const profile = rows[0] as any;
          if (!profile) return { data: { user: null }, error: null };
          return {
            data: { user: { id: userId, email: null, user_metadata: { full_name: profile.fullName ?? null } } },
            error: null,
          };
        },
      },
    },
  };
}
