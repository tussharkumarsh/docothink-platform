/**
 * Applies every migration plus the dev seed to an in-process Postgres 17 (PGlite),
 * then runs supabase/tests/*.sql, each inside a rolled-back transaction.
 *
 *   npm run db:check
 *
 * Supabase-managed schemas (auth, storage, realtime) are replaced by minimal stubs, so this
 * validates our SQL, RLS and RPC logic; it does not replace testing against a real project.
 */
import { PGlite } from "@electric-sql/pglite";
import { btree_gist } from "@electric-sql/pglite/contrib/btree_gist";
import { pgcrypto } from "@electric-sql/pglite/contrib/pgcrypto";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const root = join(import.meta.dirname, "..", "..");
const read = (...parts: string[]) => readFileSync(join(root, ...parts), "utf8");
const sqlFiles = (dir: string) =>
  readdirSync(join(root, dir))
    .filter((f) => f.endsWith(".sql"))
    .sort();

async function main() {
  const db = new PGlite({ extensions: { btree_gist, pgcrypto } });

  await db.exec(read("scripts", "db", "supabase-stubs.sql"));

  for (const file of sqlFiles("supabase/migrations")) {
    try {
      await db.exec(read("supabase", "migrations", file));
      console.log(`  migrated  ${file}`);
    } catch (error) {
      console.error(`✗ migration failed: ${file}\n  ${(error as Error).message}`);
      process.exit(1);
    }
  }

  try {
    await db.exec(read("supabase", "seed.sql"));
    console.log("  seeded    seed.sql");
  } catch (error) {
    console.error(`✗ seed failed\n  ${(error as Error).message}`);
    process.exit(1);
  }

  const [helpers, ...tests] = sqlFiles("supabase/tests");
  await db.exec(read("supabase", "tests", helpers));

  let failed = 0;
  for (const file of tests) {
    const started = Date.now();
    try {
      await db.exec(`begin;\n${read("supabase", "tests", file)}\nrollback;`);
      console.log(`✓ ${file} (${Date.now() - started} ms)`);
    } catch (error) {
      failed++;
      await db.exec("rollback;").catch(() => {});
      console.error(`✗ ${file}\n  ${(error as Error).message}`);
    }
  }

  await db.close();
  if (failed > 0) {
    console.error(`\n${failed} SQL test file(s) failed`);
    process.exit(1);
  }
  console.log(`\nAll ${tests.length} SQL test files passed`);
}

main();
