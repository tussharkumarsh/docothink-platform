# Wave 2 Doctor Tools Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give doctors a week calendar with quick time blocking, and reusable prescription templates.

**Architecture:** The calendar is a server-rendered page over existing tables, with pure placement functions and one client component for the block dialog. Templates are one new RLS-protected table; applying a template is a pure merge run in the browser, so prescriptions and their signing paths don't change.

**Tech Stack:** Next.js 16 (Cache Components), Supabase/Postgres, `temporal-polyfill`, zod, Vitest, PGlite (`npm run db:check`).

**Spec:** `docs/superpowers/specs/2026-11-03-wave2-doctor-tools-design.md`

## Global Constraints

- Week runs Monday to Sunday, in `viewer.timezone`. Default visible hours 07:00 to 21:00, 30-minute rows.
- Template limits: name 1 to 80 characters, unique per doctor ignoring case; 20 medicines; 50 templates per doctor; plan and advice up to 5000 characters, follow-up up to 1000.
- Template reminder copy, exact: "Don't include patient details."
- Templates never hold or change presenting symptoms, clinical observations, relevant history, diagnosis or amendment reason.
- Live migration only with the user's explicit go-ahead at that moment, dry run first. Merge to `main` only on "merge".
- Run `npx next typegen` after adding routes, before typecheck. Commits end with the attribution line from the session reminder.

## Review Focus

1. A block over a booked appointment: both stay visible side by side (Task 1 test).
2. A block spanning several days or midnight: appears on each day and removal states the full range (Task 1 test, Task 3 confirmation).
3. A daylight-saving day in a real zone (`America/New_York`, 8 Mar and 1 Nov 2026): placement stays correct and a nonexistent local time doesn't throw (Task 1 test).
4. Applying templates can push a draft past the 30-medicine limit in `savePrescriptionAction`: the editor refuses to apply and says so, rather than failing at save (Task 4 test).
5. Applying a template to a form with unsaved typing: the typed text survives (Task 4 merge test, Task 6 manual check).

---

### Task 1: Calendar placement functions

**Files:** Create `src/features/calendar/week.ts`, `src/features/calendar/week.test.ts`.

**Interfaces (produces):**
- `weekDays(param: string | null | undefined, today: string): { days: string[]; prev: string; next: string }`: seven `YYYY-MM-DD` dates, Monday first. Invalid or missing `param` uses `today`.
- `type Placed = { id: string; date: string; startMin: number; endMin: number; startIso: string; endIso: string; column: number; columns: number }`
- `placeItems(items: { id: string; start: string; end: string }[], days: string[], tz: string): Placed[]`: one piece per day, clipped to that day; overlapping pieces get side-by-side `column`/`columns`.
- `workingBands(rules: { weekday: number; start_time: string; end_time: string; timezone: string }[], days: string[], tz: string): { date: string; startMin: number; endMin: number }[]`: rules projected from their own zone, using `zonedInstant` from `src/lib/time/slots.ts`; a nonexistent local time is skipped.
- `hourRange(placed: { startMin: number; endMin: number }[]): { from: number; to: number }`: minutes, default 420 to 1260, widened to whole hours.

- [ ] **Step 1: Write failing tests.** Assert:
  - `weekDays("2026-11-04", …).days[0] === "2026-11-02"` and `days[6] === "2026-11-08"`; `weekDays("garbage", "2026-11-04")` gives the same; `weekDays("2026-01-01", …).days[0] === "2025-12-29"`; `prev` and `next` are 7 days either side.
  - An item 23:30 to 00:30 in `UTC` gives two pieces: `1410–1440` on day one and `0–30` on day two. An item outside `days` gives none.
  - A block overlapping an appointment gives both `columns: 2` with different `column`; a non-overlapping item keeps `columns: 1`.
  - `America/New_York`: an item 01:30 to 03:30 local on 2026-03-08 places without throwing and `endMin > startMin`; the same on 2026-11-01.
  - `workingBands` with a Monday 09:00 to 17:00 `Asia/Kolkata` rule viewed in `UTC` gives Monday `210–690`. Inactive rules are filtered by the caller, not here.
  - `hourRange([])` is `420..1260`; an item at `360–390` widens `from` to `360`; `1275–1300` widens `to` to `1320`.
- [ ] **Step 2: Run** `npx vitest run src/features/calendar/week.test.ts`. Expected: FAIL, module not found.
- [ ] **Step 3: Implement** with Temporal. Convert instants to `toZonedDateTimeISO(tz)`, using `hour * 60 + minute` for placement.
- [ ] **Step 4: Run** the same command. Expected: PASS.
- [ ] **Step 5: Commit** `feat(calendar): week and placement functions`.

### Task 2: Calendar page (read-only)

**Files:** Create `src/app/doctor/calendar/page.tsx`, `src/features/calendar/components/week-grid.tsx`; modify `src/app/doctor/layout.tsx`.

**Interfaces (consumes):** Task 1; `listAppointments({ from, to, limit: 500 })`; `requireApprovedDoctor`.

- [ ] Add nav item `{ href: "/doctor/calendar", label: "Calendar", icon: <CalendarRange /> }` after Appointments.
- [ ] Page: read `week`; compute `today` with `Intl.DateTimeFormat("en-CA", { timeZone })` and `nowMs()`; load appointments for the week padded one day each side, active `doctor_availability_rules`, and `doctor_availability_exceptions` overlapping the week. Hide `cancelled`, `refunded`, `expired`.
- [ ] `WeekGrid` (server component): at `md` and up, a CSS grid with an hour column plus 7 day columns; items absolutely positioned from `startMin`/`endMin`, with the 30-minute row height kept in one constant (`ROW_PX = 28`). Working bands white, the rest grey, blocks hatched. Below `md`, a day-by-day list of the same items. Appointments link to `/doctor/appointments/{id}`; `pending_payment` dimmed with "Awaiting payment"; status always in text. Past items dimmed.
- [ ] No rules at all: show an Alert linking to `/doctor/availability`.
- [ ] Previous, This week and Next as `Link`s; timezone in the description.
- [ ] `npx next typegen`, typecheck, lint. Commit `feat(doctor): week calendar`.

### Task 3: Quick block

**Files:** Create `src/features/calendar/components/block-dialog.tsx`; modify `week-grid.tsx`, `src/features/doctor/actions.ts`; test in `week.test.ts`.

**Interfaces (produces):** `blockEnd(date: string, startMin: number, length: "30" | "60" | "120" | "rest"): { end_date: string; end_time: string }`, in `week.ts`.

- [ ] **Step 1: Failing test.** `blockEnd("2026-11-03", 600, "60")` is `{ end_date: "2026-11-03", end_time: "11:00" }`; `blockEnd("2026-11-03", 1410, "60")` is `{ end_date: "2026-11-04", end_time: "00:30" }`; `"rest"` is `{ end_date: "2026-11-04", end_time: "00:00" }`.
- [ ] **Step 2: Run** `npx vitest run src/features/calendar`. Expected: FAIL.
- [ ] **Step 3: Implement `blockEnd`; run again.** Expected: PASS.
- [ ] **Step 4:** `BlockDialog` client component using native `<dialog>`, posting to `addExceptionAction` via `useActionState` with hidden `start_date`, `end_date`, `start_time`, `end_time`, `timezone`, and showing `FormMessage` (including the clash warning). Keep the dialog open to show the warning; close on a plain success.
- [ ] **Step 5:** Grid columns become a thin client wrapper: a click on free future time rounds down to 30 minutes and opens the dialog. Items stop propagation. Each non-past day header gets a "Block time" button opening it at the next free half hour (or the start of working hours on a future day). Grid cells aren't tab stops.
- [ ] **Step 6:** Blocks get a remove control using `deleteExceptionAction` and `ConfirmSubmit`, whose message states the block's full range.
- [ ] **Step 7:** Add `revalidatePath("/doctor/calendar")` to `addExceptionAction` and `deleteExceptionAction`.
- [ ] **Step 8:** Typecheck, lint. Commit `feat(calendar): quick block`.

### Task 4: Template table and pure logic

**Files:** Create `supabase/migrations/20261103000013_prescription_templates.sql`, `supabase/tests/10_wave2.sql`, `src/features/prescriptions/templates.ts`, `templates.test.ts`.

**Interfaces (produces):**
- Table per the spec, with unique index on `(doctor_id, lower(name))`, a `before insert` trigger raising `TEMPLATE_LIMIT` at 50, checks `jsonb_typeof(items) = 'array' and jsonb_array_length(items) <= 20`, `set_updated_at` trigger, RLS with four own-row policies, `revoke all … from anon, authenticated` then grant `select, insert, update, delete` to authenticated.
- `templateSchema` (zod): `name`, `items` (the same field limits as `itemSchema`, max 20), `treatment_plan`, `advice`, `follow_up`; refined to need one medicine or some text.
- `type TemplateFields`, and `mergeTemplate(form: { items: Item[]; treatment_plan: string; advice: string; follow_up: string }, t: Template): { ok: true; items: Item[]; treatment_plan: string; advice: string; follow_up: string } | { ok: false; error: string }`.
- `MAX_RX_ITEMS = 30`.

- [ ] **Step 1: Failing SQL tests** in `10_wave2.sql`, using the `tests.login` and `tests.expect_error` helpers and the seed doctors: another doctor sees 0 rows, and their update and delete affect 0 rows; insert with another `doctor_id` fails; admin and patient see 0 rows; `anon` gets `permission denied`; 51st insert raises `TEMPLATE_LIMIT`; 21 medicines fails its check; duplicate name in different case fails; deleting the owning `doctor_profiles` row as superuser removes the templates.
- [ ] **Step 2: Run** `npm run db:check`. Expected: FAIL, relation doesn't exist.
- [ ] **Step 3: Write the migration; run again.** Expected: all SQL files and the demo round trip pass.
- [ ] **Step 4: Failing unit tests:** an all-empty row is removed and medicines appended; an empty field takes the template's text; a filled field keeps its text with the template's below on a new line; empty template text changes nothing; merging past `MAX_RX_ITEMS` returns `{ ok: false }`; the result has no keys beyond the four merged; `templateSchema` rejects an empty template, an 81-character name and a medicine without a name.
- [ ] **Step 5: Run** `npx vitest run src/features/prescriptions/templates.test.ts`. Expected: FAIL.
- [ ] **Step 6: Implement; run again.** Expected: PASS.
- [ ] **Step 7: Commit** `feat(db): prescription templates`.

### Task 5: Template manage page

**Files:** Create `src/app/doctor/templates/page.tsx`, `src/features/prescriptions/actions.ts`, `src/features/prescriptions/components/template-form.tsx`; modify `src/app/doctor/layout.tsx`, `src/lib/errors.ts`.

**Interfaces (produces):** `saveTemplateAction(_: ActionResult, formData: FormData): Promise<ActionResult>` (insert, or update with `template_id`) and `deleteTemplateAction(formData: FormData)`, all behind `requireApprovedDoctor`, revalidating `/doctor/templates`.

- [ ] Add nav item "Rx templates" (icon `ClipboardList`) after Patients.
- [ ] Parse `items.N.field` the same way as `savePrescriptionAction`. A row with other fields filled but no medicine name returns: "Each medicine needs a name." Map the unique violation to "You already have a template with this name." and add `TEMPLATE_LIMIT` to `MESSAGES`: "You've reached the limit of 50 templates. Delete one to add another."
- [ ] Page: list by name with medicine count; create and edit with `?edit=<id>`; delete with `ConfirmSubmit`; "Don't include patient details." on the form. `TemplateForm` reuses the medicine row layout, exported from the editor as a shared `MedicineRows` component.
- [ ] Typegen, typecheck, lint. Commit `feat(doctor): prescription templates page`.

### Task 6: Use and save templates in the editor

**Files:** Modify `src/features/prescriptions/components/prescription-editor.tsx`, `src/app/doctor/appointments/[id]/prescription/page.tsx`, `src/features/prescriptions/actions.ts`.

**Interfaces (consumes):** `mergeTemplate`, `saveTemplateAction`.

- [ ] The page loads the doctor's templates and passes `templates` to `PrescriptionEditor`. It also passes a `key` so a new version remounts the editor.
- [ ] "Use template" `Select`, or a link to `/doctor/templates` when there are none. On choosing: read current values from the form with `new FormData(formRef.current)`, call `mergeTemplate`, then `setItems` with new keys so rows remount with the merged values, and write the three text fields through the form's elements. On `{ ok: false }` show the error. Reset the select. Never submit.
- [ ] "Save as template": a name input plus a `SubmitButton` with `formAction={saveAsTemplateAction}`, where `saveAsTemplateAction` ignores clinical fields and calls the same save path as `saveTemplateAction`, and doesn't touch the draft. Use a separate `useActionState` and show its `FormMessage` beside the control. Pressing Enter in the name field must not submit the draft: handle `onKeyDown`. Show "Don't include patient details."
- [ ] Add a unit test that the save-as parser keeps only `name`, `items`, `treatment_plan`, `advice` and `follow_up` when given a full form, including diagnosis and symptoms. RED first.
- [ ] Typecheck, lint. Commit `feat(prescriptions): use and save templates`.

### Task 7: Verify, review, migrate (with consent), preview, merge

- [ ] `npm run db:check && npm run typecheck && npm run lint && npm test`.
- [ ] Fresh whole-branch review by an opus reviewer; fix Critical and Important findings with tests.
- [ ] Ask the user, dry-run, then `npx supabase db push --linked`; verify the table's RLS and `anon` privileges on live.
- [ ] `npm run build`; push the branch; confirm the preview is READY; give the user the manual checklist (calendar clicks, dialog, phone layout, applying a template with unsaved text); stop for "merge".
- [ ] On "merge": fast-forward `main`, push, confirm production READY, delete `.superpowers/sdd/2026-11-03-wave2-doctor-tools`.
