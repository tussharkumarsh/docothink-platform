# Wave 1, quick wins: design

Date: 2026-10-31 · Status: awaiting user review
Roadmap: Wave 1 of 5 (`docs/05-competitor-analysis.md` research; feature list agreed in conversation).

## Goal

Five improvements that use data the platform already has, one or two per role, with no new tables:

1. **Patient:** add-to-calendar and a camera/mic test before calls
2. **Patient:** "Which doctor do I need?" guide
3. **Doctor:** earnings charts
4. **Admin:** analytics dashboard
5. **Admin:** bulk bank-payout file for approved invoices

## 1. Add to calendar + device test

- **Calendar file:** `GET /api/appointments/[id]/calendar.ics`. Only the appointment's patient or doctor can download it (RLS read of the appointment, else 404). The file is a standard iCalendar `VEVENT`:
  - UID `<appointment id>@docothink`, start/end in UTC, summary "Docothink consultation · {mode}"
  - description with the join link `{SITE_URL}/consult/{id}` and the reference
  - no patient or doctor names and no clinical text, because calendars are often synced to third parties
- **Google Calendar link:** built from the same fields (`calendar.google.com/calendar/render?action=TEMPLATE&…`).
- **Where:** the patient and doctor appointment detail pages show "Add to calendar" (.ics) and "Google Calendar" for confirmed upcoming appointments.
- **Device test:** a client component `DeviceCheck` that:
  - asks for camera and microphone (`getUserMedia`), shows a live preview and a microphone level meter, and lists any errors ("Camera blocked: allow it in the browser address bar")
  - stops all tracks when the test ends or the user leaves
  - is shown on the appointment page (for audio/video consultations) and in the consult room before joining
  - is purely local: nothing is uploaded

## 2. "Which doctor do I need?" guide

- **Page:** public `/find-care`, linked from the home hero ("Not sure which doctor? Find the right specialist") and from Find a doctor.
- **Flow:**
  - Step 1: the existing `conditions` (symptom list, already mapped to a specialty) shown as tappable chips, grouped by specialty, plus "Who is it for?" (adult / child).
  - Choosing a child routes to Pediatrics when the selected concern's specialty isn't child-specific.
  - Step 2: the suggested specialty with a one-line description and the **3 doctors with the earliest availability** (reusing `getDoctorSlots`), with "See all {specialty} doctors".
- **Safety copy** (always visible): "This guide suggests a specialty; it isn't a diagnosis. If symptoms are severe or sudden (chest pain, difficulty breathing, signs of stroke), call {emergency numbers} now."
- No free-text symptom input and no AI.

## 3. Doctor earnings charts

On `/doctor/earnings` → Overview:
- a 12-month **net earnings bar chart** per currency
- a **split by consultation type** (chat/audio/video) as a horizontal bar

Both are computed from the ledger rows the page already loads (`monthly()` plus a new pure `byMode()` helper), rendered as inline SVG following the dataviz skill (accessible labels, works in light mode, no chart library).

## 4. Admin analytics dashboard

- **Page:** `/admin/analytics` (nav item "Analytics", visible to all admins). Revenue and commission figures appear only with `finance.manage`.
- **Data:** a SQL function `admin_analytics(p_from date, p_to date) returns jsonb`. It is SECURITY DEFINER, requires `is_admin()`, and omits money fields without `finance.manage`. It aggregates in one round trip:
  - bookings per week (created) and completed consultations per week
  - **no-show rate** (no_show ÷ (completed + no_show))
  - **cancellation rate**
  - revenue (gross paid) and platform commission per currency per week
  - top 10 doctors by completed consultations (with rating)
  - top specialties by bookings
  - mode split (chat/audio/video)
  - new patients per week
  - average rating
- **UI:**
  - a range picker (last 30 / 90 / 365 days)
  - KPI tiles: bookings, completed, no-show %, cancellation %, revenue, commission, new patients, average rating
  - weekly bar charts and ranked tables
  - inline SVG, same chart components as section 3
- **Demo data:** stays included (it's a demo showcase). A note says "Includes demo data" while the demo setting is on.

## 5. Bulk payout file

- On `/admin/finance/invoices`: "Download bank file (approved invoices)" per currency.
- **Data:** a SQL function `payout_file(p_currency text)`. It requires finance.manage, is audited (`payout.file_export`), and returns every **approved** invoice in that currency with:
  - beneficiary name, account number, IFSC / sort code / routing, bank name
  - amount (major units, 2 decimals), invoice number as the payment reference
  - **taken from the invoice's bank snapshot** (the account it was raised with, as Part 2 requires)
- **CSV columns:** `beneficiary_name, account_number, ifsc_or_sort_or_routing, bank_name, amount, currency, reference, email`
  - a generic layout most banks' bulk upload accepts after column mapping
  - formula injection neutralised
  - it doesn't change any invoice status: finance still marks each paid with the bank reference
- Plain `<a download>` link (no prefetch).

## Testing

- SQL tests (`supabase/tests/09_wave1.sql`):
  - `admin_analytics`: non-admin refused; money fields absent without finance.manage; counts match a fixture
  - `payout_file`: finance only; audited; only approved invoices; uses snapshot values; respects currency
- Unit tests:
  - the `.ics` builder: required fields, line folding and escaping, UTC times, no names
  - the Google link builder
  - `byMode()`
  - the specialty-routing helper (child → Pediatrics rule)
- Typecheck, lint, build, then a preview link before merge. One migration (the two SQL functions), pushed to live only with the user's OK.

## Out of scope (later waves)

SMS/WhatsApp reminders (need a provider account), family members, follow-ups, promo codes, support tickets, week calendar, Rx templates.
