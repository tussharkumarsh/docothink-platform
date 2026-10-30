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

  const started = Date.now();
  const demoProblems = await demoRoundTrip(db).catch((error: Error) => [`unexpected error: ${error.message}`]);
  if (demoProblems.length) {
    failed++;
    console.error(`✗ demo seed/cleanup round trip\n  ${demoProblems.join("\n  ")}`);
  } else {
    console.log(`✓ demo seed/cleanup round trip (${Date.now() - started} ms)`);
  }

  await db.close();
  if (failed > 0) {
    console.error(`\n${failed} SQL test file(s) failed`);
    process.exit(1);
  }
  console.log(`\nAll ${tests.length} SQL test files passed`);
}

/**
 * supabase/demo/seed-demo.sql then cleanup-demo.sql against the seeded database: the demo dataset
 * is complete and consistent, can't be seeded twice, won't be removed while real data points at it,
 * and leaves no trace (and no damage to the real seed accounts) afterwards. Returns the problems found.
 */
async function demoRoundTrip(db: PGlite): Promise<string[]> {
  const problems: string[] = [];
  const count = async (sql: string) => Number((await db.query<{ n: number }>(sql)).rows[0].n);
  const expect = (ok: boolean, message: string) => {
    if (!ok) problems.push(message);
  };
  const realAccounts = "select count(*)::int as n from public.profiles where not is_demo";
  const before = await count(realAccounts);
  const seed = read("supabase", "demo", "seed-demo.sql");
  const cleanup = read("supabase", "demo", "cleanup-demo.sql");

  await db.exec(seed);
  await db.exec(read("supabase", "demo", "enrich-demo-profiles.sql"));
  const doctors = await count("select count(*)::int as n from public.doctor_profiles where is_demo and application_status = 'approved'");
  const patients = await count("select count(*)::int as n from public.profiles where is_demo and role = 'patient'");
  const appointments = await count("select count(*)::int as n from public.appointments a join public.profiles p on p.id = a.doctor_id where p.is_demo");
  const reviews = await count("select count(*)::int as n from public.doctor_reviews r join public.profiles p on p.id = r.doctor_id where p.is_demo");
  console.log(`  demo      ${doctors} doctors, ${patients} patients, ${appointments} appointments, ${reviews} reviews`);
  expect(doctors >= 60, `expected ≥ 60 approved demo doctors, got ${doctors}`);
  expect(patients >= 230, `expected ≥ 230 demo patients, got ${patients}`);
  expect(appointments >= 500, `expected ≥ 500 demo appointments, got ${appointments}`);
  expect(reviews >= 200, `expected ≥ 200 demo reviews, got ${reviews}`);
  expect(
    (await count("select count(*)::int as n from public.doctor_profiles d where d.is_demo and not exists (select 1 from public.doctor_availability_rules r where r.doctor_id = d.user_id)")) === 0,
    "every demo doctor needs availability",
  );
  expect(
    (await count(`select count(*)::int as n from public.appointments a join public.profiles p on p.id = a.doctor_id
       where p.is_demo and a.status = 'completed'
         and (select count(*) from public.financial_ledger_entries l where l.appointment_id = a.id and l.entry_type = 'consultation_earning') <> 1`)) === 0,
    "every completed demo appointment needs exactly one earning ledger entry",
  );
  expect((await count("select count(*)::int as n from demo_showcase")) === 6, "seed must return 6 showcase logins");
  expect(
    (await count("select count(*)::int as n from public.doctor_profiles where is_demo and (cardinality(services) < 3 or cardinality(special_interests) < 1 or practice_started_year is null)")) === 0,
    "every demo doctor needs ≥ 3 services, ≥ 1 special interest and a practice start year",
  );
  expect((await count("select count(*)::int as n from public.doctor_private_details")) === 0, "seed and enrich must not create bank or tax details");
  await db.exec(read("supabase", "demo", "demo-invoices.sql"));
  for (const status of ["pending", "under_review", "approved", "paid", "failed"]) {
    expect(
      (await count(`select count(*)::int as n from public.doctor_payouts p join public.profiles d on d.id = p.doctor_id where d.is_demo and p.source = 'invoice' and p.status::text = '${status}'`)) >= 1,
      `demo invoices must include one in status ${status}`,
    );
  }
  expect(
    (await count("select count(*)::int as n from public.doctor_payouts p where p.source = 'invoice' and p.status = 'paid' and not exists (select 1 from public.financial_ledger_entries l where l.payout_id = p.id and l.entry_type = 'payout')")) === 0,
    "every paid demo invoice needs its ledger payout entry",
  );
  expect((await count("select count(*)::int as n from public.notifications n join public.profiles p on p.id = n.user_id where not p.is_demo")) === 0,
    "demo invoices must not notify real accounts");
  expect((await count("select count(*)::int as n from public.email_outbox")) === 0, "seed must not queue emails");

  await db.exec(seed).then(
    () => problems.push("a second seed run must fail with DEMO_ALREADY_SEEDED"),
    (error: Error) => expect(error.message.includes("DEMO_ALREADY_SEEDED"), `second seed failed for the wrong reason: ${error.message}`),
  );

  // A real patient (Emily) can't book a demo doctor; if such a row existed anyway (simulated with the
  // guard off), cleanup must refuse rather than delete it.
  const linkReal = `insert into public.appointments (id, patient_id, doctor_id, mode, status, start_at, end_at, doctor_timezone,
      patient_timezone, currency, fee_snapshot, fee_amount, commission_bps)
    select '00000000-0000-4000-8000-00000000d001', '00000000-0000-4000-8000-000000000201', user_id, 'video', 'completed',
      now() - interval '5 days', now() - interval '5 days' + interval '20 minutes', timezone, 'America/New_York', currency,
      '{"video": 100}', 100, 1000
    from public.doctor_profiles where is_demo limit 1`;
  await db.exec(linkReal).then(
    () => problems.push("a real patient must not be able to book a demo doctor"),
    (error: Error) => expect(error.message.includes("DEMO_DOCTOR_NOT_BOOKABLE"), `real-patient booking failed for the wrong reason: ${error.message}`),
  );
  await db.exec(`alter table public.appointments disable trigger appointments_demo_guard;
    ${linkReal};
    alter table public.appointments enable trigger appointments_demo_guard;`);
  await db.exec(cleanup).then(
    () => problems.push("cleanup must refuse while a real account has an appointment with a demo account"),
    async (error: Error) => {
      await db.exec("rollback;").catch(() => {});
      expect(error.message.includes("REAL_DATA_LINKED"), `cleanup refused for the wrong reason: ${error.message}`);
    },
  );
  await db.exec("delete from public.appointments where id = '00000000-0000-4000-8000-00000000d001'");

  await db.exec(cleanup);
  expect((await count("select count(*)::int as n from public.profiles where is_demo")) === 0, "cleanup must remove every demo account");
  expect((await count("select count(*)::int as n from public.doctor_payouts p where not exists (select 1 from public.doctor_profiles d where d.user_id = p.doctor_id)")) === 0,
    "cleanup must remove demo invoices");
  expect((await count("select count(*)::int as n from auth.users where email like '%@demo.docothink.test'")) === 0, "cleanup must remove demo auth users");
  expect((await count("select count(*)::int as n from public.platform_settings where key = 'demo'")) === 0, "cleanup must remove the demo setting");
  expect((await count(realAccounts)) === before, "cleanup must not touch real accounts");
  expect((await count("select count(*)::int as n from public.doctor_profiles where not is_demo and application_status = 'approved'")) === 3,
    "the 3 approved seed doctors must remain");
  return problems;
}

main();
