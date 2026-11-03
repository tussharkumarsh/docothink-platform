# Wave 2: Doctor week calendar and prescription templates

Make a doctor's daily work faster: see the week at a glance and block time directly on it, and write common prescriptions in seconds. Both features are for doctors only.

## Success criteria

- A doctor sees booked appointments, working hours and blocked time for any week on one screen, in their own timezone.
- A doctor can block or unblock time from the calendar without visiting the Availability page.
- A doctor can apply a saved template to a draft prescription with one choice, without losing anything already typed.
- A template never finalises, signs or saves a prescription. The doctor reviews and signs as today.

## 1. Week calendar

### Page

`/doctor/calendar`, a new sidebar item "Calendar" (after "Appointments"). Requires an approved doctor. The existing appointment list tabs stay unchanged.

- `?week=YYYY-MM-DD`: any date in the wanted week. Missing or invalid means the current week. The week runs Monday to Sunday.
- All times are in the doctor's profile timezone (`viewer.timezone`), shown in the page description.
- Controls: Previous, This week, Next, as links.
- No limit on how far the doctor can navigate.

### What is shown

| Item | Display |
|---|---|
| Appointment `confirmed`, `in_progress`, `completed`, `no_show` | Time, patient name, consultation type. Links to `/doctor/appointments/{id}`. Status is shown in text, never by colour alone. |
| Appointment `pending_payment` | Same, dimmed and labelled "Awaiting payment". |
| Appointment `cancelled`, `refunded`, `expired` | Hidden. |
| Availability rules (active) | Working hours on a white background; all other time is grey. Rules are projected onto each date from the rule's own timezone. |
| Availability exceptions | Hatched block with the reason and a remove control. |

Vertical range: 07:00 to 21:00, extended to whole hours to include anything earlier or later that week. Rows are 30 minutes.

### Positioning rules

Placement uses local wall-clock minutes in the doctor's timezone, computed with Temporal:

- An item crossing midnight is split into one piece per day, each clipped to that day.
- Items that overlap on a day (a block over a booked appointment) sit side by side, each in equal-width columns, so neither is hidden.
- On a daylight-saving change, items keep their real local start and end labels. A 23-hour or 25-hour day doesn't break placement.

### Quick block

- Clicking free future time on the grid opens a small dialog: start (date and time, prefilled and rounded down to 30 minutes), length (30 minutes, 1 hour, 2 hours, Rest of day), optional reason (max 200 characters).
- Each day header has a "Block time" button opening the same dialog, which is the keyboard path; grid cells aren't tab stops.
- Past time can't be clicked. A day that has fully passed has no "Block time" button.
- "Rest of day" ends at the following local midnight.
- Saving reuses `addExceptionAction`. A clash with a confirmed appointment shows that action's existing warning and the appointment stays booked.
- Removing asks for confirmation, stating the block's full range, and reuses `deleteExceptionAction`. A multi-day block is removed whole.
- Both actions additionally revalidate `/doctor/calendar`.

### Phones

Below the `md` breakpoint the grid is replaced by a day-by-day list of the same items, with each day's "Block time" button. There is no horizontal page scroll.

### Empty and failure states

- A week with nothing in it still shows the grid, or the day list on phones.
- A doctor with no availability rules sees an all-grey grid plus a link to the Availability page.
- If the data can't be loaded, the page throws to the existing error boundary, like the other doctor pages.

## 2. Prescription templates

### Data

New table `public.prescription_templates`:

| Column | Rule |
|---|---|
| `id` | uuid primary key |
| `doctor_id` | references `doctor_profiles (user_id)` on delete cascade |
| `name` | 1 to 80 characters after trimming; unique per doctor, ignoring case |
| `items` | jsonb array, at most 20 entries, default `[]` |
| `treatment_plan` | up to 5000 characters |
| `advice` | up to 5000 characters |
| `follow_up` | up to 1000 characters |
| `created_at`, `updated_at` | standard, using `set_updated_at` |

Each `items` entry has the same fields and limits as `prescription_items`, excluding `id`, `prescription_id` and `position`: `medication_name` (required, 1 to 200), `strength`, `dosage_form`, `dose`, `route`, `frequency`, `duration` (each up to 100), `instructions` (up to 1000). The shape and field limits are validated with zod in the server actions; the database enforces the array type and the 20-entry limit.

A doctor may have at most 50 templates, enforced by a `before insert` trigger raising `TEMPLATE_LIMIT`. A template needs at least one medicine or some text in plan, advice or follow-up; this is validated in the server action.

Templates never hold presenting symptoms, clinical observations, relevant history or diagnosis. Diagnosis stays out deliberately: it is required to finalise, and the doctor should decide it for each patient.

### Access

Row-level security: a doctor can select, insert, update and delete only rows where `doctor_id = auth.uid()`. Admins and patients have no access. `anon` has no privileges, and default privileges are revoked explicitly. Doctor-side server actions use `requireApprovedDoctor`.

Demo data creates no templates, and the existing demo cleanup still succeeds because of the cascade.

### Manage page

`/doctor/templates`, a new sidebar item "Rx templates" (after "Patients"): list by name, create, edit and delete with confirmation. The form uses the same medicine fields as the prescription editor, and states "Don't include patient details." A doctor at the limit sees the limit message from the action.

### Using a template

On a draft in `PrescriptionEditor`, a "Use template" dropdown lists the doctor's templates by name. Choosing one changes only the form in the browser; nothing is sent to the server. A pure function decides the merge:

- Medicines are appended to the list. A medicine row with every field empty is removed first.
- `treatment_plan`, `advice` and `follow_up`: if the field is empty, it takes the template's text; if it has text, the template's text is added below on a new line. Empty template text changes nothing.
- Symptoms, observations, history, diagnosis and amendment reason are never touched.
- Text typed but not yet saved is kept.

If the doctor has no templates, the editor shows a link to `/doctor/templates` instead of the dropdown.

The result is still only a draft: the existing save and "Finalise & sign" paths and their immutability rules are unchanged, and templates add no route to a signed prescription.

### Save as template

The editor gets a "Save as template" control with a name field. It saves the form's current medicines, plan, advice and follow-up as a new template, without saving the draft, and shows success or the error (duplicate name, limit reached) inline. It repeats the "Don't include patient details." reminder. A medicine row with an empty medicine name but other fields filled is rejected with a clear message.

## Testing

- **Unit:** week from a date, including invalid input and year boundaries; day placement across midnight, overlap columns and daylight-saving days in a real timezone; availability projection between zones; the template merge rules; the template zod schema.
- **SQL (`supabase/tests/10_wave2.sql`):** one doctor can't read, change or delete another's templates; admin, patient and `anon` get nothing; the 50-template and 20-medicine limits; duplicate name ignoring case; deleting a doctor profile removes templates.
- **Whole suite:** `npm run db:check`, including the demo round trip, typecheck, lint, `npm test`, `npm run build`.
- **Manual in a browser on the preview:** calendar clicks, the dialog, phone layout, and applying a template. These have no automated test because the project has no DOM test environment.

## Release

Migration `20261103000013_prescription_templates.sql` is applied to the live database only after the user's go-ahead, with a dry run first. Then preview, then merge to `main` only when the user says "merge".

## Out of scope

Drag-to-reschedule, month view, recurring blocks, editing an existing block (remove and re-add instead), templates shared across doctors, a medicine database, drug-interaction checks, and admin access to calendars or templates.
