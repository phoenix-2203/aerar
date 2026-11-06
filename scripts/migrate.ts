// Apply Drizzle migrations from ./drizzle.
// DATABASE_URL set -> that Postgres (node-postgres). Unset -> embedded PGlite at PGLITE_DIR (default .data/pglite).
import { closeDb, migrateDatabase } from "@/db";

async function main() {
  const target = await migrateDatabase();
  console.log(`Migrations applied (${target === "postgres" ? "DATABASE_URL" : "embedded PGlite"}).`);
  await closeDb();
}

main().catch(async (e) => {
  console.error(e instanceof Error ? e.message : e);
  await closeDb();
  process.exit(1);
});
