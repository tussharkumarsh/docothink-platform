# Wave 1 Quick Wins Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add-to-calendar and a device test, a "which doctor" guide, doctor earnings charts, an admin analytics dashboard and a bulk bank-payout file, all on existing data.

**Architecture:** Two read-only SQL functions (analytics aggregation, payout file) in one migration; pure TS helpers with unit tests (iCalendar, Google link, specialty routing, mode split); a shared inline-SVG chart component; new pages and routes in the existing portals.

**Tech Stack:** Next.js 16, Supabase Postgres, Vitest, PGlite `db:check`; no new npm dependencies.

**Spec:** `docs/superpowers/specs/2026-10-31-wave1-quick-wins-design.md`

## Global Constraints

- Branch `wave1-quick-wins`; migration `supabase/migrations/20261031000012_wave1_reports.sql`; SQL conventions as in 0009–0011 (SECURITY DEFINER, `set search_path = ''`, revoke from public/anon, explicit grants, `FORBIDDEN` with errcode 42501).
- Calendar entries never contain patient/doctor names or clinical text: summary exactly `Docothink consultation · {Chat|Audio call|Video call}`, description `Join: {SITE_URL}/consult/{id}\nReference: {reference}`.
- Guide safety copy (exact): "This guide suggests a specialty; it isn't a diagnosis. If symptoms are severe or sudden (chest pain, difficulty breathing, signs of stroke), call 911 (US), 999 (UK) or 112 (India) now."
- Charts: inline SVG only, load the `dataviz` skill before writing chart code; every chart has a text alternative (table or `aria-label` summary).
- Download links are plain `<a download>` (no next/link prefetch).
- Payout file reads the invoice `bank_snapshot` (never current details), finance.manage only, audited `payout.file_export`.
- Migration reaches live only with the user's explicit OK, before any preview build.

## Review Focus

1. **A patient opens another patient's `/api/appointments/{id}/calendar.ics`:** 404, nothing leaked (Task 2 route uses RLS read).
2. **An appointment titled with special characters or a long description:** the `.ics` stays valid (escaping and 75-octet folding tested in Task 2).
3. **Camera permission denied or no camera present:** DeviceCheck shows a clear message and the page still works; the stream is stopped on unmount (Task 3 manual check plus code review).
4. **An admin without finance.manage opens analytics:** no money figures in the HTML (Task 1 SQL test plus Task 6).
5. **Payout file with an invoice whose doctor changed bank details after submitting:** the file uses the snapshot (Task 1 SQL test).

---

### Task 1: Report functions and SQL tests

**Files:** Create `supabase/migrations/20261031000012_wave1_reports.sql`, `supabase/tests/09_wave1.sql`.

**Interfaces (Produces):**
- `public.admin_analytics(p_from date, p_to date) returns jsonb`. Requires `public.is_admin()` (else FORBIDDEN). Keys:
  - `bookings_by_week [{week, count}]`, `completed_by_week [{week, count}]` (`week` = `date_trunc('week', …)::date`, created_at for bookings, start_at for completed)
  - `totals {bookings, completed, no_show, cancelled, new_patients, avg_rating}`
  - `mode_split [{mode, count}]`
  - `top_doctors [{doctor_id, name, completed, rating_avg}]` (10)
  - `top_specialties [{name, bookings}]` (10)
  - `new_patients_by_week [{week, count}]`
  - only when `has_permission('finance.manage')`: `revenue_by_week [{week, currency, gross, commission}]` (from `consultation_earning` ledger entries: gross_amount and commission_amount) and `revenue_totals [{currency, gross, commission}]`
  - Range is `[p_from, p_to + 1 day)` on the relevant timestamp.
- `public.payout_file(p_currency text) returns table(beneficiary_name text, account_number text, routing_code text, bank_name text, amount numeric, currency text, reference text, email text)`. Requires finance.manage; audits `payout.file_export` with `{currency, count}`. Rows: `doctor_payouts` with `source='invoice'`, `status='approved'`, `currency = upper(p_currency)`. `routing_code` = coalesce(snapshot ifsc, sort_code, routing_number). `amount = amount / 100.0` rounded to 2 decimals. `email` from profiles. Ordered by `submitted_at`.
- Grants: execute to authenticated; revoke from public/anon.
- [ ] **Step 1:** Write `09_wave1.sql`, using the fixture style of `08_invoices.sql`: verified bank details for Mehta, 2 completed appointments with earnings plus 1 no_show plus 1 cancelled, one approved invoice. Assertions:
  - Emily → `admin_analytics` FORBIDDEN
  - admin `*` → `totals.completed = 2`, `totals.no_show = 1`, `revenue_totals` present
  - the reviews-only moderator from 05 style (create one with `reviews.manage`) → no `revenue_by_week` key
  - `payout_file('INR')` as admin returns 1 row whose `account_number` equals the snapshot value even after Mehta's details are changed with `save_private_details`
  - `amount` = net / 100
  - audit row `payout.file_export` exists
  - doctors-only admin → FORBIDDEN
  - `payout_file('GBP')` → 0 rows
- [ ] **Step 2:** `npm run db:check` → `09` FAILS (function missing).
- [ ] **Step 3:** Write the migration. **Step 4:** `npm run db:check` → all pass. **Step 5:** Commit `feat(db): analytics and bank payout file report functions`.

### Task 2: Add to calendar

**Files:** Create `src/lib/calendar.ts`, `src/lib/calendar.test.ts`, `src/app/api/appointments/[id]/calendar.ics/route.ts`, `src/features/appointments/components/add-to-calendar.tsx`; modify `src/app/patient/appointments/[id]/page.tsx`, `src/app/doctor/appointments/[id]/page.tsx`.

**Interfaces (Produces):** `buildIcs(e: { uid: string; start: string; end: string; summary: string; description: string; url: string; now: string }): string` (CRLF lines, `BEGIN:VCALENDAR`/`VERSION:2.0`/`PRODID:-//Docothink//EN`, UTC `YYYYMMDDTHHMMSSZ`, escape `\ ; , newline`, fold lines > 75 octets with CRLF + space); `googleCalendarUrl(e: same minus uid/now): string`. `AddToCalendar({ appointmentId, start, end, mode, reference })`, a server component rendering two links.
- [ ] **Step 1:** Tests:
  - output contains `DTSTART:20261105T123000Z` for `2026-11-05T12:30:00Z`
  - `SUMMARY:Docothink consultation · Video call`
  - `;` and `,` in the description escaped
  - a 200-character description is folded (no line > 75 octets)
  - every line ends with `\r\n`
  - the Google URL has `dates=20261105T123000Z/20261105T125000Z` and an encoded `text`
- [ ] **Step 2:** RED. **Step 3:** Implement; the route reads the appointment with the user client (`select id, reference, mode, start_at, end_at, status`, RLS) and returns 404 if absent; `Content-Type: text/calendar; charset=utf-8`, `Content-Disposition: attachment; filename="docothink-{reference}.ics"`. Show the links when status is confirmed and start is in the future.
- [ ] **Step 4:** GREEN plus typecheck. **Step 5:** Commit `feat(appointments): add to calendar`.

### Task 3: Device check

**Files:** Create `src/features/consultation/components/device-check.tsx` (client); modify the patient and doctor appointment pages (audio/video modes, upcoming) and `src/features/consultation/components/consult-room.tsx` (before joining).

**Interfaces (Produces):** `DeviceCheck({ video: boolean })`:
- a "Test camera & microphone" button
- `navigator.mediaDevices.getUserMedia({ audio: true, video })`
- a preview `<video muted playsInline autoPlay>`
- a mic level meter via `AudioContext` + `AnalyserNode` (requestAnimationFrame, RMS → 0–100%)
- a "Stop test" button
- cleanup: stop all tracks, close the AudioContext and cancel rAF on stop and unmount
- error messages by `DOMException.name`: `NotAllowedError` → "Access blocked. Allow camera and microphone in your browser's address bar, then try again."; `NotFoundError` → "No camera or microphone found."; otherwise a generic message
- [ ] Implement; `npm run typecheck && npm run lint`. Commit `feat(consultation): camera and microphone check`.

### Task 4: "Which doctor do I need?" guide

**Files:** Create `src/features/catalog/find-care.ts`, `find-care.test.ts`, `src/app/(site)/find-care/page.tsx`, `src/features/catalog/components/find-care-form.tsx` (client); modify the home hero (`src/app/(site)/page.tsx`) and `src/app/(site)/doctors/page.tsx` (link).

**Interfaces (Produces):** `suggestSpecialty(selected: { slug: string; specialty_slug: string | null }[], forChild: boolean): string | null` (most frequent specialty among the selections; tie → first selected; `forChild` and result not in `CHILD_SAFE = ["pediatrics", "dermatology", "ent", "ophthalmology", "dentistry", "psychiatry"]` → `"pediatrics"`; nothing selected → null).
- The page reads `?concerns=a,b&for=child|adult` and is server-rendered:
  - without params: the form (chips grouped by specialty, plus the who-for toggle) that GETs the same page
  - with params: the suggested specialty, its description and the 3 earliest-available doctors (reuse `searchDoctors({ specialty })` + `getDoctorSlots` + `sortDoctors(…, "available")`), plus "See all"
  - the safety copy always shows
- [ ] Tests:
  - `[{specialty_slug:"dermatology"}]`, adult → "dermatology"
  - the same with `forChild` → "dermatology" (child-safe)
  - `[{specialty_slug:"cardiology"}]`, child → "pediatrics"
  - two cardiology and one dermatology → "cardiology"
  - a tie → the first selected
  - none → null
- RED → GREEN → typecheck/lint → commit `feat(site): which-doctor guide`.

### Task 5: Chart components and doctor earnings charts

**Files:** Create `src/components/charts/bar-chart.tsx`, `src/features/finance/breakdown.ts`, `breakdown.test.ts`; modify `src/app/doctor/earnings/page.tsx` (Overview tab).

**Interfaces (Produces):**
- `BarChart({ data: { label: string; value: number }[]; format: (v: number) => string; title: string; height?: number })`, a server component:
  - vertical bars, y-axis max rounded up to a nice step, value labels on hover via `<title>`
  - an `aria-label` summarising min, max and latest
  - a visually hidden table fallback
- `HBar({ data: { label: string; value: number }[]; format; title })`: horizontal share bars.
- `byMode(ledger: LedgerRow[] with mode, currency): { mode: string; net: number }[]`: the earnings page passes mode from the ledger's appointment. Extend `getLedger` select with `appointments(mode)` and map it to `mode: string | null`.
- [ ] Load the `dataviz` skill first. Tests for `byMode`: sums consultation_earning plus refund_reversal per mode, ignores payout rows, filters by currency. RED → GREEN → render 12-month `monthly()` per currency plus mode split on Overview → typecheck/lint → commit `feat(doctor): earnings charts`.

### Task 6: Admin analytics page

**Files:** Create `src/app/admin/analytics/page.tsx`; modify `src/app/admin/layout.tsx` (nav "Analytics", icon `ChartColumn`, after Overview).
- Range via `?range=30|90|365` (default 30) → `p_from = today − range`, `p_to = today` (admin display zone).
- KPI tiles via `Stat`; `BarChart` for bookings per week, completed per week and new patients per week; revenue per week per currency only when present.
- Tables: top doctors (name, completed, rating), top specialties, mode split (`HBar`).
- "Includes demo data" `Badge` when the `demo` setting is on.
- [ ] Implement; typecheck/lint; commit `feat(admin): analytics dashboard`.

### Task 7: Bulk payout file

**Files:** Create `src/app/api/payout-file/route.ts`; modify `src/app/admin/finance/invoices/page.tsx`.
- `GET /api/payout-file?currency=INR`: finance.manage else 403; calls `payout_file`; CSV with header `beneficiary_name,account_number,ifsc_or_sort_or_routing,bank_name,amount,currency,reference,email`, the same `csvCell` neutralisation as the statements route, filename `docothink-payouts-{currency}-{YYYY-MM-DD}.csv`, `Cache-Control: no-store`.
- Invoice queue header: one `<a download>` per currency that has approved invoices (query distinct currencies of approved invoices).
- [ ] Implement; typecheck/lint; commit `feat(admin): bulk bank payout file`.

### Task 8: Verify, review, migrate (with consent), preview, merge

- [ ] `npm run db:check && npm run typecheck && npm run lint && npm test && npm run build` (build only after the migration is live; before that, typecheck).
- [ ] Fresh whole-branch review; fix Critical/Important with tests.
- [ ] Ask the user, `npx supabase db push` (dry run first), verify; build; push the branch; preview; stop for "merge".
