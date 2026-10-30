import { schemaSql } from "./schema";
import { EMBEDDING_DIM } from "./embeddings";

/**
 * One tiny query interface over two backends:
 *  - DATABASE_URL set  -> real Postgres (Neon in production) via `pg`
 *  - DATABASE_URL unset -> embedded Postgres (PGlite + pgvector) on local disk
 * Both use $1-style parameters, so the SQL in this repo runs unchanged on either.
 */
export interface Db {
  query<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<T[]>;
}

const globalForDb = globalThis as unknown as { __ragDb?: Promise<Db> };

export function getDb(): Promise<Db> {
  // Cache on globalThis so Next.js dev hot reloads don't open a new connection each time.
  globalForDb.__ragDb ??= connect().catch((err) => {
    globalForDb.__ragDb = undefined;
    throw err;
  });
  return globalForDb.__ragDb;
}

async function connect(): Promise<Db> {
  const db = process.env.DATABASE_URL ? await connectPostgres(process.env.DATABASE_URL) : await connectPglite();
  for (const statement of schemaSql(EMBEDDING_DIM)) {
    await db.query(statement);
  }
  return db;
}

async function connectPostgres(url: string): Promise<Db> {
  const { Pool } = await import("pg");
  const pool = new Pool({ connectionString: url, max: 5 });
  return {
    async query<T>(sql: string, params: unknown[] = []) {
      const res = await pool.query(sql, params);
      return res.rows as T[];
    },
  };
}

async function connectPglite(): Promise<Db> {
  const { PGlite } = await import("@electric-sql/pglite");
  const { vector } = await import("@electric-sql/pglite-pgvector");
  const dataDir = process.env.PGLITE_DIR ?? ".data/pglite";
  const pg = await PGlite.create(dataDir, { extensions: { vector } });
  return {
    async query<T>(sql: string, params: unknown[] = []) {
      const res = await pg.query<T>(sql, params);
      return res.rows;
    },
  };
}

/** pgvector accepts the text form '[0.1,0.2,...]' cast with ::vector. */
export function toVectorLiteral(embedding: number[]): string {
  return `[${embedding.join(",")}]`;
}
