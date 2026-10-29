# Reviews and Demo Data Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Verified patient reviews (patient form, public ratings, doctor view, admin moderation) plus a tagged, removable demo dataset of about 64 doctors, 240 patients and 600 appointments in the live Supabase project.

**Architecture:** A single new migration adds `doctor_reviews`, rating aggregates, `is_demo` flags, two RPCs and a public view. The Next.js app reads through those (no service-role reads for reviews). The demo dataset is two committed SQL scripts (`seed-demo.sql`, `cleanup-demo.sql`), exercised by `npm run db:check` before being run against the live project.

**Tech Stack:** Next.js 16 (Cache Components, server actions), Supabase Postgres 17 + RLS, Tailwind v4, Vitest, PGlite (`scripts/db/check.ts`).

**Spec:** `docs/superpowers/specs/2026-10-29-reviews-and-demo-data-design.md`

## Global Constraints

- Branch: `reviews-demo`. Nothing reaches `main` until the user approves a Vercel preview.
- Read `node_modules/next/dist/docs/` before Next.js API work (AGENTS.md). `usePathname`/`useSearchParams` under dynamic routes need `<Suspense>`.
- Migration file: `supabase/migrations/20261029000009_reviews_demo.sql`. Follow `20261029000007_rls.sql`: tables start with **no** grants for `anon`/`authenticated`; grant columns/functions explicitly; `security definer` + `set search_path = ''`; errors as `raise exception 'CODE' using errcode = 'P0001'` (or `'42501'` for authorisation).
- Review rules: rating 1–5; comment ≤ 1000 chars; one review per appointment; appointment `completed` and `end_at` within the last **30 days**; comment starts `pending`; hidden reviews still count toward stars.
- Public display name: first name + last initial (e.g. "Emily C."), or "Anonymous patient". Never expose `patient_id` publicly.
- Moderation permission: `reviews.manage` (admins holding `*` pass via `public.has_permission`).
- Demo accounts: email domain `demo.docothink.test`; `profiles.is_demo = true`; demo doctors also `doctor_profiles.is_demo = true` (public badge, since `profiles` isn't public); registration numbers `DEMO-…`; `platform_settings` key `demo` = `{"enabled": true}`.
- Demo notice copy (exact): "Demo data: doctors, patients and reviews shown here are fictional and for presentation only."
- Never print or commit real secrets. Showcase demo passwords are printed by the seed run only.

## Review Focus

1. **A real patient booked a demo doctor:** cleanup must stop and list the appointments, not delete them (Task 7 test).
2. **Seed run twice:** the second run must fail fast with `DEMO_ALREADY_SEEDED`, not duplicate 64 doctors (Task 7 test).
3. **A review on a refunded or cancelled appointment, or one older than 30 days:** rejected (Task 1 tests).
4. **A doctor with zero ratings:** cards and profile show no stars and no "0.0"; "Highest rated" puts them last (Task 2 tests).
5. **A comment with personal details before approval:** never visible to anon, other patients or the doctor until approved (Task 1 test, via the public view and doctor RLS).

---

### Task 1: Reviews and demo-flag migration

**Files:**
- Create: `supabase/migrations/20261029000009_reviews_demo.sql`
- Test: `supabase/tests/05_reviews.sql`

**Interfaces:**
- Produces (SQL):
  - table `public.doctor_reviews(id uuid pk, appointment_id uuid unique fk appointments, doctor_id uuid fk doctor_profiles(user_id), patient_id uuid fk patient_profiles(user_id), rating smallint check 1–5, comment text ≤1000 null, is_anonymous bool default false, comment_status text check in ('none','pending','approved','hidden'), moderated_by uuid null fk profiles, moderated_at timestamptz null, created_at timestamptz default now())`
  - `doctor_profiles.rating_avg numeric(3,2) null`, `doctor_profiles.rating_count integer not null default 0`, `doctor_profiles.is_demo boolean not null default false`; `profiles.is_demo boolean not null default false`
  - trigger `doctor_reviews_aggregate` (after insert/update/delete) recomputing `rating_avg`/`rating_count` for the affected doctor(s) over **all** reviews
  - `public.submit_review(p_appointment uuid, p_rating smallint, p_comment text, p_anonymous boolean) returns public.doctor_reviews`; errors `FORBIDDEN`, `REVIEW_NOT_ALLOWED` (status/age), `REVIEW_EXISTS`, `INVALID_RATING`. Empty/whitespace comment → `null` with `comment_status 'none'`.
  - `public.moderate_review(p_review uuid, p_status text) returns void`, with `p_status` in ('approved','hidden'); requires `has_permission('reviews.manage')`; calls `public.audit('review.moderate', 'review', p_review::text, …)` (match the existing `audit` signature in `20261029000005_finance_ops.sql:251`).
  - view `public.public_doctor_reviews(id, doctor_id, rating, comment, reviewer_name, created_at)`, `security_invoker = false`, comment shown only when `comment_status = 'approved'`, `reviewer_name` = 'Anonymous patient' or first name + ' ' + last initial + '.' from `profiles.full_name`. Grant select to anon, authenticated.
  - RLS on `doctor_reviews`: patient selects own; doctor selects own reviews but `comment` only when approved (expose through the view; grant the doctor no direct comment access); admin selects all. No direct insert/update/delete grants (RPCs only).
  - grant `select (rating_avg, rating_count, is_demo)` on `doctor_profiles` to anon/authenticated alongside the existing public columns; grant execute on `submit_review` to authenticated, `moderate_review` to authenticated.

- [ ] **Step 1: Write `supabase/tests/05_reviews.sql`** using `tests.login`, `tests.assert`, `tests.expect_error` from `00_helpers.sql` and seed ids (Emily `…0201`, Dr Mehta `…0101`, admin `…0001`). Set up a completed appointment by inserting it as `confirmed` with times 2 days ago (as the postgres role), then `update … set status='in_progress'`, then `'completed'`. Assertions:
  - Emily reviews it with rating 5 and comment "Very thorough" → row exists, `comment_status = 'pending'`; Mehta's `rating_count = 1`, `rating_avg = 5.00`.
  - second `submit_review` on it → `REVIEW_EXISTS`
  - Oliver (`…0202`) reviews Emily's appointment → `FORBIDDEN`
  - rating 6 → `INVALID_RATING`
  - an appointment completed 31 days ago → `REVIEW_NOT_ALLOWED`; a `cancelled` one → `REVIEW_NOT_ALLOWED`
  - as anon: `public_doctor_reviews` row has `comment is null`, `reviewer_name = 'Emily C.'`, and the view has no `patient_id` column (`select … from information_schema.columns`)
  - Emily calls `moderate_review` → `permission denied` or `FORBIDDEN`; admin approves → anon sees the comment
  - admin hides → comment null again, `rating_count` still 1
  - anonymous review → `reviewer_name = 'Anonymous patient'`
- [ ] **Step 2: Run** `npm run db:check`. Expected: `05_reviews.sql` FAILS (missing function/table).
- [ ] **Step 3: Write the migration** to the Interfaces above.
- [ ] **Step 4: Run** `npm run db:check`. Expected: all migrations apply, all tests (00–05) pass.
- [ ] **Step 5: Commit** `feat(db): doctor reviews, rating aggregates and demo flags`.

### Task 2: Rating helpers, doctor card and "Highest rated" sort

**Files:**
- Modify: `src/features/catalog/discovery.ts`, `src/features/catalog/discovery.test.ts`
- Modify: `src/features/catalog/queries.ts` (`DoctorCard` type + `CARD_COLUMNS` gain `rating_avg, rating_count, is_demo`)
- Modify: `src/features/catalog/components/doctor-card.tsx`
- Create: `src/components/ui/avatar.tsx` (`InitialsAvatar`)

**Interfaces:**
- Produces: `formatRating(avg: number | null, count: number): string | null` → `"4.8 (123)"`, `null` when `count === 0`. `SORT_OPTIONS` gains `{ value: "rated", label: "Highest rated" }`; `sortDoctors(..., "rated")` orders by `rating_avg` desc, then `rating_count` desc, unrated last. `ListedDoctor["doctor"]` gains `rating_avg: number | null; rating_count: number`. `InitialsAvatar({ name: string; size: number; className?: string })`: up to 2 initials (ignoring the "Dr" title) on a colour chosen deterministically from the name's hash among 6 brand-safe tints.
- [ ] **Step 1: Failing tests** in `discovery.test.ts`: `formatRating(4.84, 123) === "4.8 (123)"`, `formatRating(null, 0) === null`, `formatRating(5, 1) === "5.0 (1)"`; `sortDoctors(list, "rated")` puts (4.9, 10) before (4.9, 3) before (4.2, 50) before unrated.
- [ ] **Step 2: Run** `npx vitest run src/features/catalog/discovery.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement** the helpers and extend the types/columns.
- [ ] **Step 4: Card:** a star + `formatRating` line under the name when non-null; a "Demo" `Badge` (tone neutral) when `is_demo`; `InitialsAvatar` instead of the default photo when `photo_path` is null.
- [ ] **Step 5: Run** `npm test && npm run typecheck`. Expected: PASS.
- [ ] **Step 6: Commit** `feat(catalog): ratings on doctor cards, highest-rated sort, initials avatars`.

### Task 3: Patient review form

**Files:**
- Create: `src/features/reviews/actions.ts`, `src/features/reviews/components/review-form.tsx`
- Modify: `src/app/patient/appointments/[id]/page.tsx`

**Interfaces:**
- Consumes: RPC `submit_review` (Task 1).
- Produces: `submitReviewAction(_: ActionResult, formData: FormData): Promise<ActionResult>` with fields `appointment_id` (uuid), `rating` (1–5), `comment` (≤1000), `anonymous` ("on"). It validates with zod like `src/features/booking/actions.ts`, maps RPC errors via `friendlyError`, and calls `revalidatePath` for the appointment page and `revalidateTag("doctors")`.
- [ ] **Step 1:** Implement the action and form: 5 star radio buttons (accessible `fieldset` + `legend`), textarea, anonymous checkbox, using `ActionForm` from `@/components/ui/form-client` with `hideOnSuccess`. Success message (exact): "Thanks for your review. Your comment will appear once it's been checked."
- [ ] **Step 2:** On the page, when `appt.status === 'completed'`: if the patient's review exists (select from `doctor_reviews` where `appointment_id`), show their stars and comment status ("Awaiting review" / "Published" / "Not published"); otherwise, if `end_at` is within 30 days, show the form in a `Card` titled "Rate your consultation".
- [ ] **Step 3: Run** `npm run typecheck && npm run lint`. Expected: clean.
- [ ] **Step 4: Commit** `feat(reviews): patients can rate completed consultations`.

### Task 4: Public profile reviews and doctor dashboard

**Files:**
- Create: `src/features/reviews/queries.ts`, `src/features/reviews/components/rating-summary.tsx`, `src/features/reviews/components/review-list.tsx`
- Modify: `src/app/(site)/doctors/[slug]/page.tsx`, `src/app/doctor/page.tsx`

**Interfaces:**
- Produces: `getDoctorReviews(doctorId: string, limit = 10): Promise<PublicReview[]>` (cached, `cacheTag("doctors", "reviews:" + doctorId)`, reading `public_doctor_reviews` with the public client), `getRatingDistribution(doctorId: string): Promise<Record<1|2|3|4|5, number>>` (from the same view). `PublicReview = { id: string; rating: number; comment: string | null; reviewer_name: string; created_at: string }`.
- [ ] **Step 1:** `RatingSummary` (big average, stars, count, five bars 5→1) and `ReviewList` (stars, reviewer name, "Verified patient" badge, date, comment; reviews without an approved comment are skipped in the list). Render both on the doctor profile when `rating_count > 0`.
- [ ] **Step 2:** Doctor dashboard: a `Stat` "Your rating" (`formatRating`, or "No ratings yet") plus the 5 most recent rows from `public_doctor_reviews` for `viewer.id`.
- [ ] **Step 3: Run** `npm run typecheck && npm run lint`. Expected: clean.
- [ ] **Step 4: Commit** `feat(reviews): ratings on doctor profiles and the doctor dashboard`.

### Task 5: Admin moderation

**Files:**
- Create: `src/app/admin/reviews/page.tsx`
- Modify: `src/features/admin/actions.ts`, `src/app/admin/layout.tsx` (nav item `{ href: "/admin/reviews", label: "Reviews", icon: <Star /> }` after Appointments)

**Interfaces:**
- Consumes: RPC `moderate_review`.
- Produces: `moderateReviewAction(formData: FormData)` with fields `review_id`, `status` ('approved' | 'hidden'), then `revalidatePath("/admin/reviews")` and `revalidateTag("doctors")`.
- [ ] **Step 1:** Page guarded like other admin pages (`requireRole("admin")`). Filters via search params: `status` (default `pending`), `rating`, `doctor` (name search). The table shows date, doctor, patient (full name; admins only), stars, comment, appointment reference link, and Approve / Hide buttons. Oldest first for `pending`. Use the user-scoped server client; admin RLS from Task 1 allows reads.
- [ ] **Step 2: Run** `npm run typecheck && npm run lint && npm run build`. Expected: clean, and `/admin/reviews` is listed.
- [ ] **Step 3: Commit** `feat(admin): review moderation queue`.

### Task 6: Demo notice

**Files:**
- Create: `src/components/layout/demo-notice.tsx`
- Modify: `src/app/(site)/layout.tsx`, `src/components/layout/portal-shell.tsx`

**Interfaces:**
- Produces: `async function DemoNotice()`, which reads `platform_settings` key `demo` with the public client (`"use cache"`, `cacheLife("minutes")`, `cacheTag("settings")`) and renders the exact copy from Global Constraints in a slim `bg-amber-50 text-amber-900 text-xs` bar when `enabled === true`, else `null`. Check that `platform_settings` row `demo` is readable by anon in `20261029000007_rls.sql`; if settings are not public, add `demo` to whatever key allow-list exists (in the Task 1 migration if a policy change is needed; amend and re-run `db:check`).
- [ ] **Step 1:** Implement and place it under the site header and the portal header, inside `<Suspense fallback={null}>`.
- [ ] **Step 2: Run** `npm run build`. Expected: clean.
- [ ] **Step 3: Commit** `feat(ui): demo data notice driven by platform settings`.

### Task 7: Demo seed and cleanup scripts

**Files:**
- Create: `supabase/demo/seed-demo.sql`, `supabase/demo/cleanup-demo.sql`
- Modify: `scripts/db/check.ts` (after the SQL tests: run seed-demo, assert counts, run cleanup, assert zero demo rows and the 6 seed accounts intact, each step in its own rolled-back transaction where it doesn't need to persist)

**Interfaces:**
- Consumes: Task 1 columns; `public.post_consultation_earning(uuid)`; `public.appointment_transition_allowed` order (`confirmed → in_progress → completed`; `confirmed → cancelled → refunded`; `confirmed → no_show`).
- Produces: running `seed-demo.sql` returns rows `(role, email, password)` for 3 showcase doctors and 3 showcase patients.

`seed-demo.sql` requirements (deterministic: `select setseed(0.42)` first; names from fixed arrays):
- Guard: `if exists (select 1 from public.profiles where is_demo) then raise exception 'DEMO_ALREADY_SEEDED'`.
- **Doctors (64):** 2–4 per active specialty (4 for general-medicine, dermatology, gynaecology, psychiatry). Country cycle IN/GB/US → currency INR/GBP/USD, zone Asia/Kolkata / Europe/London / America/New_York. Fees in minor units: IN chat 30000–60000, audio +20%, video +40%; GB 2000–4000; US 3000–7000 (round to 100). Experience 4–30. Languages: IN {English, Hindi + one of Tamil/Bengali/Gujarati/Punjabi}, GB {English}, US {English, Spanish for ~30%}. Qualifications and headline from a per-specialty lookup. `registration_number 'DEMO-' || lpad(n, 4, '0')`. 3–6 availability days, a 3–4 hour window, slot 20 or 30 min, buffer 0–10, modes all three (US: audio and video only for ~30%). Approved, `is_demo` on both profile tables, `photo_path` null. Create users via `auth.users` + `auth.identities` exactly as `supabase/seed.sql` does (`signup_role 'doctor'`), random password per account except the showcases.
- **Patients (240):** fictional first/last name arrays, country mix 50% IN / 25% GB / 25% US, matching time zone, date of birth 1950–2008, sex, city.
- **Past appointments (~450, last 60 days):** pick a doctor, then a slot on that doctor's rule grid in the past. Insert as `confirmed` with the `book_appointment` column values (`fee_snapshot`, `fee_amount`, `commission_bps = public.effective_commission_bps(doctor)`, `specialty_id` = primary specialty, both zones), plus `appointment_intakes` with a reason from a per-specialty list. Skip candidates that hit the exclusion constraints (catch `exclusion_violation` per row). Then ~85% `→ in_progress → completed` with a consultation row (joined/started/ended within the slot) and `post_consultation_earning`; ~10% `→ cancelled` via `public.create_refunds` as the patient-cancel policy would; ~5% `→ no_show`.
- **Payments:** a `manual` succeeded payment (`provider_payment_id 'demo_' || id`) for each paid appointment; `amount_paid = fee_amount`.
- **Prescriptions:** ~50% of completed, status `issued`, 1–3 items from a per-specialty list.
- **Upcoming (~150, next 14 days):** confirmed, on free grid slots, with payments.
- **Reviews (~60% of completed):** insert directly into `doctor_reviews` (the RPC requires `auth.uid()`). Ratings weighted 5:55%, 4:30%, 3:10%, 2:4%, 1:1%. ~70% with a comment from per-specialty templates (`comment_status 'approved'`), ~15% anonymous.
- `insert into platform_settings (key, value) values ('demo', '{"enabled": true}') on conflict (key) do update …`
- Finally delete `notifications` and `email_outbox` rows for demo users.
- Return the showcase credentials (passwords from `'Demo' || translate(encode(extensions.gen_random_bytes(9),'base64'),'+/=','xyz') || '7'`).

`cleanup-demo.sql` requirements:
- If any appointment has a non-demo patient and a demo doctor (or the reverse), `raise exception 'REAL_DATA_LINKED: %'` listing the references.
- Delete in FK order: reviews, prescription items/prescriptions, consultation messages/consultations, intakes, events, change requests, clinical grants, documents, ledger entries, refunds, payments, appointments, availability rules and exceptions, doctor specialties, credentials, fee history, application events, notifications, outbox, audit rows referencing demo ids, patient medical/patient profiles, doctor profiles, admin permissions, profiles, auth identities, auth users. Then delete the `demo` setting. Derive the exact table list from the migrations (`grep -n "references public.profiles\|references public.appointments"`), not from this list alone.

- [ ] **Step 1:** Extend `scripts/db/check.ts` with the demo round trip and these assertions: ≥ 60 demo doctors, ≥ 230 demo patients, ≥ 500 demo appointments, ≥ 200 reviews, every demo doctor with ≥ 1 availability rule, every completed demo appointment with exactly one ledger entry, a second seed run raises `DEMO_ALREADY_SEEDED`; after cleanup 0 `is_demo` profiles, no `demo` setting, and the 6 `seed.sql` accounts unchanged. Also: insert a booking of seed patient Emily with a demo doctor, then assert cleanup raises `REAL_DATA_LINKED`.
- [ ] **Step 2: Run** `npm run db:check`. Expected: FAIL (scripts missing).
- [ ] **Step 3:** Write both scripts.
- [ ] **Step 4: Run** `npm run db:check`. Expected: all pass, with the counts printed.
- [ ] **Step 5: Commit** `feat(demo): removable demo dataset scripts with round-trip check`.

### Task 8: Preview, merge and live run

- [ ] **Step 1:** `npm run typecheck && npm run lint && npm test && npm run build`. All clean.
- [ ] **Step 2:** Push `reviews-demo` and wait for the Vercel preview to be `READY`. **Stop for user review.**
- [ ] **Step 3 (after the user says merge):** fast-forward `main`, push, then `npx supabase db push` (applies migration 0009 to the live project). The user may need to approve this.
- [ ] **Step 4:** `npx supabase db query --linked -f supabase/demo/seed-demo.sql`. Capture the showcase logins.
- [ ] **Step 5: Verify live:** counts as in Task 7; `/doctors` lists 60+; the home stats band shows real counts; the demo notice is visible. Report the showcase logins to the user once.
