# Settlement Invoices Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Doctors raise settlement invoices from selected completed consultations. Finance admins approve or reject them and record the manual bank transfer. TDS is withheld for Indian doctors. Everything runs on the existing payout ledger.

**Architecture:** Invoices are `doctor_payouts` rows with `source = 'invoice'`, whose `payout_items` are the selected ledger entries (the existing unique key prevents double payment). SQL RPCs handle submitting, withdrawing and rejecting; approve and paid reuse `update_payout_status`. Next.js pages: doctor Earnings tabs and a printable invoice; admin invoice queue and detail, settings, and a TDS CSV.

**Tech Stack:** Next.js 16, Supabase Postgres + RLS, zod, Vitest, PGlite `db:check`.

**Spec:** `docs/superpowers/specs/2026-10-30-settlement-invoices-design.md`

## Global Constraints

- Branch `settlement-invoices`; migration `supabase/migrations/20261030000011_settlement_invoices.sql`. Same SQL conventions as 0009/0010: revoke-all on new relations, SECURITY DEFINER + `set search_path = ''`, `raise exception 'CODE' using errcode = 'P0001'` (`'42501'` for authorisation), explicit grants.
- `alter type public.payout_status add value 'cancelled'`: any use in the same migration must compare as text (`status::text = 'cancelled'`) (lesson from 0010).
- `update_platform_setting` only updates existing keys, so the migration **inserts** the `tds` (`{"rate_bps": 1000, "countries": ["IN"]}`) and `billing` (`{"company_name": "", "address": "", "gstin": "", "pan": "", "email": ""}`) rows.
- TDS formula (exact): `floor((gross * rate_bps + 5000) / 10000)`; applied only when `bank_country` ∈ `tds.countries`.
- Invoice number: `'INV-' || to_char(now(), 'YYYY') || '-' || lpad(nextval('public.invoice_number_seq')::text, 6, '0')`.
- Status labels for invoices: pending "Submitted", under_review "Under review", approved "Approved", paid "Paid", failed "Rejected", cancelled "Withdrawn".
- The migration must reach live **before** any build/preview; it needs the user's OK at that moment (dry run first).
- Patient identity on invoices: initials only (e.g. "E. C."), never full names.

## Review Focus

1. **Doctor raises an invoice, then an admin's date batch runs:** the batch must not include those entries (Task 1 test).
2. **Doctor with verified KYC changes bank details after submitting:** the invoice keeps the snapshot it was raised with, and KYC goes back to pending, but existing invoices are unaffected (Task 1 test).
3. **A refund reversal created after an invoice was submitted:** it isn't silently lost. It stays invoiceable on a later invoice (Task 1 test).
4. **Admin rejects after approving:** the items are released and the doctor can re-invoice them (Task 1 test).
5. **Printing the invoice:** no navigation, sidebar or buttons in print (Task 4, `no-print` classes).

---

### Task 1: Migration and SQL tests

**Files:** Create `supabase/migrations/20261030000011_settlement_invoices.sql`, `supabase/tests/08_invoices.sql`.

**Interfaces (Produces):**
- `doctor_payouts`: `batch_id` nullable; `source text not null default 'batch' check (source in ('batch','invoice'))`; `check ((source = 'batch') = (batch_id is not null))`; `invoice_number text unique`; `gross_amount bigint`; `tds_rate_bps integer not null default 0`; `tds_amount bigint not null default 0 check (tds_amount >= 0)`; `bank_snapshot jsonb`; `rejection_reason text check (char_length ≤ 1000)`; `submitted_at timestamptz`. Replace `unique (batch_id, doctor_id)` semantics only for batches (it allows multiple nulls already, so it stays).
- `create sequence public.invoice_number_seq`; `payout_status` + `'cancelled'`; settings rows `tds`, `billing`.
- `public.invoiceable_entries() returns table(ledger_entry_id bigint, appointment_id uuid, reference text, start_at timestamptz, mode public.consultation_mode, patient_initials text, currency text, amount bigint, gross_amount bigint, commission_amount bigint, entry_type public.ledger_entry_type)`: the caller's (doctor) unsettled `consultation_earning` and `refund_reversal` entries with `appointment_id` (refund reversals joined through `refunds.appointment_id` when `appointment_id` is null on the entry). Ordered by start_at desc.
- `public.submit_invoice(p_appointments uuid[]) returns public.doctor_payouts`: rules and errors exactly as in the spec (`KYC_NOT_VERIFIED`, `NOTHING_SELECTED`, `ENTRY_NOT_INVOICEABLE`, `MIXED_CURRENCY`, `NOTHING_TO_PAY`); advisory lock `hashtextextended('invoice:' || auth.uid(), 0)`; bank_snapshot = `to_jsonb(doctor_private_details row) - 'kyc_note' - 'verified_by' - 'updated_at'`; `notify_admins('finance.manage', 'invoice-submitted:' || id, 'Invoice submitted', …, '/admin/finance/invoices/' || id)`; `audit('invoice.submit', …)`.
- `public.withdraw_invoice(p_payout uuid) returns void`: owner doctor, `source='invoice'`, status pending, else `NOT_PENDING`; status → cancelled; delete payout_items.
- `public.reject_invoice(p_payout uuid, p_reason text) returns void`: finance.manage; `source='invoice'`; status in pending/under_review/approved else `INVALID_TRANSITION`; reason required (`NOTE_REQUIRED`); status → failed, rejection_reason; delete payout_items; enqueue_notification to doctor (template null), link `/doctor/invoices/' || id`; audit.
- **Update `create_settlement_batch`** (`create or replace`) so its entry selection is unchanged (it already skips entries with payout_items). Verify by test only, no code change unless the test fails.
- RLS: existing policies on `doctor_payouts` / `payout_items` (check `20261029000007_rls.sql`) must let a doctor read only their own payouts. Add a `select` grant only if missing. Grants: execute on the 4 new functions to authenticated; revoke from public/anon.
- [ ] **Step 1: Write `08_invoices.sql`.** Fixtures as postgres: give Dr Mehta (`…0101`, INR) verified IN private details (insert directly, `kyc_status 'verified'`) and 3 completed appointments with earnings (insert appointments as completed with `amount_paid`, then `post_consultation_earning`). Give Dr Clarke (`…0102`, GBP) verified GB details and 1 completed appointment. Assertions:
  - Mehta submits [a1, a2] → row with source invoice, number like `INV-____-______`, gross = sum of the two earnings, tds = half-up 10%, amount = gross − tds, 2 payout_items, `bank_snapshot ->> 'pan' = 'ABCDE1234F'`
  - submitting a1 again → `ENTRY_NOT_INVOICEABLE`; Clarke submitting a Mehta appointment → `ENTRY_NOT_INVOICEABLE`; a confirmed (not completed) appointment → `ENTRY_NOT_INVOICEABLE`; `{}` → `NOTHING_SELECTED`
  - Clarke's GB invoice → tds 0, amount = gross
  - with Clarke's kyc set to pending → `KYC_NOT_VERIFIED`
  - finance admin runs `create_settlement_batch(current_date, 'INR', now())` → the batch payout for Mehta contains only a3's entry (not a1 and a2)
  - Mehta withdraws → cancelled, items gone, a1 invoiceable again (appears in `invoiceable_entries()`)
  - a non-owner doctor withdrawing → `FORBIDDEN`; withdrawing a non-pending invoice → `NOT_PENDING`
  - new invoice; admin `update_payout_status(id, 'approved')`; `reject_invoice` with an empty reason → `NOTE_REQUIRED`; with a reason → failed, items released
  - new invoice → approved → `update_payout_status(id, 'paid', null)` → `TRANSACTION_REFERENCE_REQUIRED`; with reference `UTR123` → paid, and a ledger `payout` entry = −amount
  - an admin with only `doctors.manage` calling `reject_invoice` → `FORBIDDEN`
  - Clarke can't select Mehta's payouts (0 rows)
  - Review Focus 2: after submit, Mehta changes `account_number` via `save_private_details` → the invoice snapshot still has the old number
  - Review Focus 3: a refund reversal created for a2 after a2 was paid → appears in `invoiceable_entries()`
- [ ] **Step 2: Run** `npm run db:check`. Expected: `08` FAILS (function missing).
- [ ] **Step 3: Write the migration.** **Step 4: Run** again. Expected: all pass, plus the round trip.
- [ ] **Step 5: Commit** `feat(db): settlement invoices on the payout ledger with TDS`.

### Task 2: Invoice maths helper

**Files:** Create `src/features/finance/invoice.ts`, `invoice.test.ts`.
**Interfaces:** `invoiceTotals(entries: { amount: number }[], tdsRateBps: number, applyTds: boolean): { gross: number; tds: number; net: number }` (same half-up formula); `INVOICE_STATUS: Record<string, { label: string; tone: Tone }>`; `patientInitials(fullName: string | null): string`.
- [ ] Tests first: `invoiceTotals([{amount: 90000}, {amount: 72000}], 1000, true)` → `{ gross: 162000, tds: 16200, net: 145800 }`; rounding `amount: 105` at 1000 bps → tds 11 (10.5 → 11); `applyTds false` → tds 0; `patientInitials("Emily Carter") === "E. C."`, `patientInitials(null) === "Patient"`. RED → implement → GREEN. **Commit** `feat(finance): invoice totals helper`.

### Task 3: Doctor raise-invoice and invoices list

**Files:** Modify `src/app/doctor/earnings/page.tsx` (tabs via `?tab=overview|raise|invoices`), create `src/features/finance/components/raise-invoice-form.tsx` (client: checkboxes, select all, live totals via `invoiceTotals`, submits ids), `src/features/finance/actions.ts` (`submitInvoiceAction(_, formData)` reading `appointment_id` values; `withdrawInvoiceAction(formData)`); errors in `src/lib/errors.ts` with a test first for `KYC_NOT_VERIFIED`, `NOTHING_SELECTED`, `ENTRY_NOT_INVOICEABLE`, `MIXED_CURRENCY`.
- The Raise tab reads `invoiceable_entries()`, the TDS setting and the doctor's `kyc_status`/`bank_country`. When KYC isn't verified: an Alert linking to `/doctor/profile?tab=bank` and a disabled submit.
- After a successful submit, redirect to `/doctor/invoices/{id}`.
- [ ] Errors test RED→GREEN; build pages; `npm run typecheck && npm run lint && npm test`. **Commit** `feat(doctor): raise and track settlement invoices`.

### Task 4: Printable invoice document

**Files:** Create `src/features/finance/components/invoice-document.tsx` (server, used by doctor and admin), `src/app/doctor/invoices/[id]/page.tsx`, reuse `src/features/prescriptions/components/print-button.tsx`.
- Data: payout row with items → ledger entries → appointments (reference, start_at, mode, patient name → initials), the `billing` setting, the doctor profile + `bank_snapshot` (masked in the document: account `••••` + last 4, PAN first 2 + `••••` + last 2).
- Layout: header with invoice number, status badge, submitted and paid dates; "From" (doctor name, address from the snapshot or current private details, registration number, PAN/GSTIN masked); "Bill to" (billing setting; "Company details not set" in amber if empty); a line table; totals (gross, TDS with rate, net); payment block (bank masked; paid reference and date when paid); rejection reason when rejected. Wrap nav/buttons in `no-print`.
- [ ] Implement; `npm run typecheck && npm run lint`. **Commit** `feat(finance): printable settlement invoice`.

### Task 5: Admin invoices queue, detail, settings, TDS report

**Files:** Create `src/app/admin/finance/invoices/page.tsx`, `src/app/admin/finance/invoices/[id]/page.tsx`, `src/app/api/tds-report/route.ts`; modify `src/app/admin/finance/page.tsx` (links), `src/app/admin/settings/page.tsx` + `SETTING_SCHEMAS` (`billing`: company_name ≤200, address ≤500, gstin optional pattern, pan optional pattern, email optional; `tds`: rate_bps 0–3000, countries fixed `["IN"]`), `src/features/admin/actions.ts` (`rejectInvoiceAction`, `invoiceStatusAction` wrapping `update_payout_status` for under_review/approved/paid with reference/method/notes).
- Detail page: `InvoiceDocument` + actions by status (pending: Start review / Approve / Reject; under_review: Approve / Reject; approved: Mark paid (reference required) / Reject). Plus `RevealBank` (from Part 1) for the full account.
- TDS CSV columns: invoice_number, paid_at, doctor, pan (full, finance only), gross, tds, net, currency; filter by paid date range; requires finance.manage (same pattern as `/api/statements`).
- [ ] Implement; `npm run typecheck && npm run lint`. **Commit** `feat(admin): invoice approvals, billing settings and TDS report`.

### Task 6: Demo invoices

**Files:** Create `supabase/demo/demo-invoices.sql`; modify `supabase/demo/cleanup-demo.sql` (delete `payout_items` of demo payouts, then demo `doctor_payouts`; already partly there); modify the `scripts/db/check.ts` round trip (run after enrich; assert ≥ 5 demo invoices covering pending, under_review, approved, paid, failed; cleanup leaves 0 demo payouts).
- 6 demo doctors (first by registration_number, mixed countries) get `doctor_private_details` with valid-pattern fake values (IN: account `000000000001`, IFSC `DEMO0000001`, PAN `DEMOP0001X`; GB sort `000001`, account `00000001`; US routing `000000001`, tax id `000000001`, account `0000001`), bank_name "Demo Bank", `kyc_status 'verified'`. Then invoices via the same insert logic as `submit_invoice` (run as postgres: replicate the inserts, or set the JWT claims to the doctor and call `submit_invoice`; prefer calling the RPC with `set_config('request.jwt.claims', …)` like `book-now.sql`). Then move them into their target statuses with the RPCs as a finance admin claim. Paid reference `DEMO-UTR-000001`…
- Idempotent: skip if any demo invoice exists.
- [ ] Round-trip assertions RED → script → GREEN. **Commit** `feat(demo): demo invoices in every state`.

### Task 7: Verify, review, migration (with consent), preview, merge

- [ ] `npm run db:check && npm run typecheck && npm run lint && npm test`.
- [ ] Final whole-branch review (fresh reviewer); fix Critical/Important with tests.
- [ ] Ask the user; `npx supabase db push` (dry run first); verify.
- [ ] `npm run build`; push the branch; preview READY; **stop for user review**.
- [ ] On "merge": fast-forward main, push; run `demo-invoices.sql` on live; verify counts.
