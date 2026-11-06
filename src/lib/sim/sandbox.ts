// One shared sandbox database per process, leased to one scenario at a time and wiped at the start of each lease.
//
// Production: SANDBOX_DATABASE_URL points at a separate, throwaway Postgres database (e.g. aerar_sandbox).
//   Real Postgres costs almost no extra memory, and the parallel scenarios exercise real row locks.
// Elsewhere (tests, CLI, local dev): one in-memory PGlite per process. A PGlite instance holds ~0.5 GB of
//   WebAssembly memory that it never gives back, so it is created once and reused, never once per run.
import { sql } from "drizzle-orm";
import type { Db } from "@/db";
import * as schema from "@/db/schema";

const TABLES = "organisations, agents, tasks, task_agents, policies, providers, purchases, audit_events";

/** Refuse anything that could be the real database: wiping it would destroy the ledger. */
export function assertSandboxUrl(url: string, realUrl: string | undefined) {
  if (realUrl && url.trim() === realUrl.trim()) throw new Error("SANDBOX_DATABASE_URL must not be DATABASE_URL");
  let name = "";
  try {
    name = decodeURIComponent(new URL(url).pathname.replace(/^\//, ""));
  } catch {
    throw new Error("SANDBOX_DATABASE_URL is not a valid URL");
  }
  if (!/sandbox/i.test(name)) throw new Error(`Sandbox database name must contain "sandbox" (got "${name || "none"}")`);
}

async function openSandbox(): Promise<Db> {
  const path = await import("node:path");
  const migrationsFolder = path.join(process.cwd(), "drizzle");
  const url = process.env.SANDBOX_DATABASE_URL;
  if (url) {
    assertSandboxUrl(url, process.env.DATABASE_URL);
    const { drizzle } = await import("drizzle-orm/node-postgres");
    const { migrate } = await import("drizzle-orm/node-postgres/migrator");
    const { Pool } = await import("pg");
    // Parallel scenarios fire ten purchases at once, each in its own transaction.
    const db = drizzle(new Pool({ connectionString: url, max: 12 }), { schema });
    await migrate(db, { migrationsFolder });
    return db as unknown as Db;
  }
  const { PGlite } = await import("@electric-sql/pglite");
  const { drizzle } = await import("drizzle-orm/pglite");
  const { migrate } = await import("drizzle-orm/pglite/migrator");
  const db = drizzle(new PGlite(), { schema });
  await migrate(db, { migrationsFolder });
  return db as unknown as Db;
}

const g = globalThis as unknown as { __aerarSandbox?: Promise<Db>; __aerarSandboxQueue?: Promise<void> };

/** Wait for the sandbox, wipe it, and hold it until `release()`. Leases are served one at a time, in order. */
export async function leaseSandbox(): Promise<{ db: Db; release: () => void }> {
  let release!: () => void;
  const prev = g.__aerarSandboxQueue ?? Promise.resolve();
  g.__aerarSandboxQueue = new Promise<void>((r) => (release = r));
  await prev;
  try {
    g.__aerarSandbox ??= openSandbox().catch((e) => {
      g.__aerarSandbox = undefined; // retry on the next lease
      throw e;
    });
    const db = await g.__aerarSandbox;
    await db.execute(sql.raw(`TRUNCATE ${TABLES} RESTART IDENTITY CASCADE`));
    return { db, release };
  } catch (e) {
    release();
    throw e;
  }
}
