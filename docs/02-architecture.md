# 02 — Unified Architecture, Migration Matrix and Roadmap

## Decisions (confirmed 2026-10-29)

| Topic | Decision |
|---|---|
| Location | New repo `docothink-platform/`. Legacy repos stay untouched for reference |
| Database | Supabase migrations in `supabase/migrations`. No live project yet; apply with `supabase db push` once one exists |
| Legacy data | Start fresh. Dev-only seed data in `supabase/seed.sql`, clearly marked |
| Currency | Per-doctor currency (INR, USD or GBP). The patient pays in the doctor's currency. Commission and earnings use the same currency. No FX |
| Payments | Provider interface, Stripe Checkout as the first adapter. "Unconfigured" until keys exist; never fakes success |

## Stack

Next.js 16.4 (App Router, `cacheComponents`, `proxy.ts`), React 19.3, TypeScript strict, Tailwind v4, Supabase (Postgres 17, Auth, Realtime, Storage), `@supabase/ssr`, Zod 4, `temporal-polyfill` for time zones, Stripe SDK, Vitest. Icons: `lucide-react`. Email via a provider interface (Resend over plain HTTP, or console in dev). No chat or video SaaS.

## Folder structure

```
src/
  app/
    (site)/            public website: home, specialties, doctors, booking, content and legal pages
    (auth)/            login, signup, forgot/reset password, doctor signup
    auth/callback/     Supabase PKCE/OTP exchange route
    patient/           patient portal
    doctor/            doctor portal
    admin/             admin portal
    consult/[id]/      shared consultation room (chat + WebRTC)
    api/               webhooks (stripe), cron (outbox, reminders, sweeps), signed downloads, ICE config
  components/ui/       design system primitives
  components/layout/   site header/footer, portal shell
  features/<domain>/   queries.ts (server reads), actions.ts (server actions), schemas.ts (Zod), components/
  lib/
    supabase/          server / browser / service-role clients
    auth/              data access layer: getSession, requireRole, requirePermission
    time/              Temporal-based slot generation and formatting (pure, unit tested)
    money/             minor-unit money and commission maths (pure, unit tested)
    payments/          PaymentProvider interface, Stripe adapter
    email/             EmailProvider interface, templates, outbox processor
    webrtc/            TURN credential generation, peer-connection helpers
  proxy.ts             optimistic session refresh + redirect for portal paths (not an authorization layer)
supabase/
  migrations/          schema, RLS, storage, RPCs
  seed.sql             dev-only demo data
  tests/               SQL assertions for RLS and booking RPCs (run against a dev project)
```

## Security model

1. **Identity vs profile vs permission.** `auth.users` holds identity. `public.profiles` holds role and display data (created by a trigger; `role` is not client-writable). `public.admin_permissions` grants admins granular rights (`clinical.read`, `finance.manage`, `doctors.manage`, `settings.manage`, `audit.read`, `appointments.manage`, `patients.manage`).
2. **RLS on every table.** Clients get `SELECT` through policies. Clients get **no direct `UPDATE`/`DELETE`** on appointments, payments, ledger, prescriptions-once-final, payouts. Those change only through `SECURITY DEFINER` RPCs that check `auth.uid()` and role inside the function.
3. **Service-role key** is used only server-side for: Stripe webhooks, cron jobs, the email outbox, admin auth operations (inviting users), and signed download URLs, each after its own authorization check. `import 'server-only'` guards the module.
4. **Clinical access** = `doctor_can_access_patient(doctor, patient)`: a non-cancelled appointment between them, or an active, unrevoked `clinical_access_grants` row (patient-granted share or admin referral with reason). Admins need `clinical.read`. Sensitive reads are written to `audit_logs`.
5. **Private storage.** `medical-documents` and `doctor-credentials` buckets are private. Uploads use server-issued signed upload URLs after type/size validation. Downloads go through a route handler that checks access, logs an audit event, and returns a 60-second signed URL.
6. **Realtime.** Chat uses `postgres_changes`, which honours RLS. WebRTC signalling uses **private** Broadcast channels authorised by RLS policies on `realtime.messages`.

## Scheduling and time zones

- Rules (`doctor_availability_rules`) store weekday, local start/end time, slot length, buffer, offered modes, and **the IANA zone they were written in**.
- Slots are generated in TypeScript with Temporal: for each date in the doctor's zone → `ZonedDateTime` → UTC instant. Nonexistent local times (spring-forward gap) are skipped. Ambiguous ones (fall-back) use the earlier instant.
- The database is the source of truth at booking time. `slot_is_bookable()` re-derives the doctor-local time from the UTC instant with Postgres `AT TIME ZONE` (DST-aware tzdata), checks the rule window and grid, exceptions, notice period and horizon. An **exclusion constraint** (`btree_gist`, `tstzrange &&`) makes double booking impossible even under concurrency.
- Appointments store `start_at`/`end_at` (timestamptz, UTC) plus `doctor_timezone` and `patient_timezone` snapshots.

## Appointment state machine

```
pending_payment ─► confirmed ─► in_progress ─► completed
      │               │  ▲            │
      ▼               │  └ reschedule │ (approved change request keeps "confirmed", increments reschedule_count)
   expired            ├─► cancelled ─► refunded
                      └─► no_show
```

"Change requested" and "rescheduled" are **derived states** (an open `appointment_change_requests` row; `reschedule_count > 0`) and are shown as badges, not stored as `status`. Reason: the confirmed slot must stay protected while a request is pending, so the appointment's status must remain `confirmed`. Overloading `status` would release or ambiguate the slot. A trigger rejects any transition not in the table above.

## Money

Integer minor units (`bigint`), ISO-4217 `currency char(3)`. Commission in basis points (1000 = 10%). `commission = round_half_up(gross × bps / 10000)`, `net = gross − commission`, so the parts always sum to the gross. Rates come from `commission_rules` (global default plus optional per-doctor override, effective-dated, append-only = audit history) and are **snapshotted on each appointment**.

Ledger (`financial_ledger_entries`) is append-only (a trigger blocks UPDATE/DELETE):
- `consultation_earning` (+net) posted once per appointment when it is completed **and** paid (unique index makes it idempotent).
- `refund_reversal` (−doctor share of a refund) if a refund happens after earning.
- `adjustment` (±, admin, with note).
- `payout` (−amount) posted when a payout is marked **paid**, which requires a transaction reference.

Payout items link ledger entries to a payout (each entry at most once), giving consultation-wise statements and preventing duplicate payouts.

## Feature migration matrix

| Legacy feature | Legacy status | New destination |
|---|---|---|
| Home page, specialties carousel, conditions, FAQ, testimonials | Working UI, static | `(site)/page.tsx`, `/specialties`, `/faq`; specialties from DB |
| Content pages (About, Ayurveda, Women's, Mental health, Child care) | Static | `(site)/about`, `(site)/health/[topic]` |
| Privacy, Terms | Static | `(site)/legal/*` + new Medical disclaimer (flag for legal review) |
| Doctor directory | Fetches all, fake filters | `/doctors` server-side filters: specialty, mode, language, country, fee, availability |
| Doctor details | Working display | `/doctors/[slug]` with live slots in the patient's zone |
| Signup (doctor/patient) | Insecure (password = username) | Supabase Auth: email/password + verification, magic link; doctor onboarding wizard |
| Admin login | Client-only session | Supabase Auth + server DAL + RLS |
| Admin doctor CRUD | API-backed | `/admin/doctors` review/approve/suspend, commission override; doctors edit their own profile |
| Admin patient CRUD + questionnaire | API-backed | `/patient/medical-profile` (patient-owned, sectioned, resumable); admin sees account data only unless `clinical.read` |
| Appointments (admin) | API-backed, hardcoded time list | `/admin/appointments` filters, cancel, change-request decisions |
| Assign doctor / patient query | Partly mock | Replaced by patient-chosen doctor + chat consultation mode |
| Doctor today/upcoming/history | Client-side filter of all data | `/doctor/appointments` (RLS-scoped queries) |
| Doctor availability | Mock | `/doctor/availability` rules, exceptions, 7-day preview |
| Query consultation / chat | PUT whole patient doc | `/consult/[id]` realtime chat |
| Phone/video | PeerJS cloud + external socket.io | `/consult/[id]` native WebRTC + Supabase private broadcast signalling + TURN-ready |
| Doctor prescription (free text) | API-backed | Structured prescriptions with items, finalize, amend (versioned), printable |
| Earnings | Sum of totals, no commission | `/doctor/earnings` from ledger |
| Invoices / claim settlement | Mock | `/patient/payments` receipts; `/admin/finance` settlements and payouts |
| Discounts | API-backed | Deferred (not in brief). Schema leaves room |
| CMS (blogs, banners, testimonials, someone-to-talk) | API-backed | Deferred. Static content for v1; flagged in roadmap |
| Notifications | Simple list | In-app `notifications` + email outbox with retries |

## Roadmap

| Phase | Scope |
|---|---|
| 1 | Audit ✔ |
| 2 | Migrations: schema, RLS, storage, RPCs, seed; DB types; Supabase clients; auth DAL; proxy |
| 3 | Design system, public site, ported content |
| 4 | Auth flows, patient portal: medical profile, appointments, reports, payments |
| 5 | Doctor portal: onboarding, profile, availability, appointments, prescriptions, earnings |
| 6 | Admin portal: overview, doctors, patients, appointments, change requests, finance/payouts, settings, audit |
| 7 | Consultation room: chat + WebRTC |
| 8 | Stripe adapter + webhook, refunds, email outbox, reminders, cron |
| 9 | Unit tests (time zones, money, state machine, TURN creds), SQL test script, typecheck, lint, build |
| 10 | Deployment guide, env, security checklist, competitor analysis |

## Critical risks

1. **No live database during development**: SQL is written carefully but has not run against Postgres until a project exists. `supabase/tests/` gives a scripted check to run first.
2. **TURN**: peer-to-peer only works for most, not all, networks. Budget for a coturn VM (~US$5–10/month) or a TURN provider before launch.
3. **Vercel Hobby cron runs at most daily**, so frequent jobs (outbox retries, reminders, no-show sweeps) are triggered by Supabase `pg_cron` + `pg_net` calling a secret-protected route (free on Supabase).
4. **Compliance**: Supabase HIPAA requires a Team plan + BAA. UK requires DSPT/UK GDPR work. Documented, not claimed.
