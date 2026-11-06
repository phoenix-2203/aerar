import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import * as schema from "./schema";

// Any Postgres driver Drizzle supports: node-postgres when DATABASE_URL is set, PGlite (embedded) otherwise.
export type Db = PgDatabase<PgQueryResultHKT, typeof schema>;

const g = globalThis as unknown as { __aerarDb?: Promise<Db> };

export function getDb(): Promise<Db> {
  if (!g.__aerarDb) g.__aerarDb = open();
  return g.__aerarDb;
}

/** Apply ./drizzle migrations to whichever database getDb() targets. PGlite is migrated on open already. */
export async function migrateDatabase(): Promise<"postgres" | "pglite"> {
  const db = await getDb();
  if (!process.env.DATABASE_URL) return "pglite";
  const { migrate } = await import("drizzle-orm/node-postgres/migrator");
  const path = await import("node:path");
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await migrate(db as any, { migrationsFolder: path.join(process.cwd(), "drizzle") });
  return "postgres";
}

/** Close the pool so CLI scripts can exit. */
export async function closeDb() {
  if (!g.__aerarDb) return;
  const db = (await g.__aerarDb) as unknown as { $client?: { end?: () => Promise<void>; close?: () => Promise<void> } };
  await (db.$client?.end?.() ?? db.$client?.close?.());
  g.__aerarDb = undefined;
}

async function open(): Promise<Db> {
  const url = process.env.DATABASE_URL;
  if (url) {
    const { drizzle } = await import("drizzle-orm/node-postgres");
    const { Pool } = await import("pg");
    return drizzle(new Pool({ connectionString: url, max: 5 }), { schema }) as unknown as Db;
  }
  const { PGlite } = await import("@electric-sql/pglite");
  const { drizzle } = await import("drizzle-orm/pglite");
  const { migrate } = await import("drizzle-orm/pglite/migrator");
  const path = await import("node:path");
  const dir = process.env.PGLITE_DIR || path.join(process.cwd(), ".data", "pglite");
  const fs = await import("node:fs");
  fs.mkdirSync(dir, { recursive: true });
  const db = drizzle(new PGlite(dir), { schema });
  await migrate(db, { migrationsFolder: path.join(process.cwd(), "drizzle") });
  return db as unknown as Db;
}
