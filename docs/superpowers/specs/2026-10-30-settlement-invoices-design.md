# Settlement invoices: design (Part 2 of 2)

Date: 2026-10-30 · Status: approved in conversation, awaiting written-spec review
Depends on Part 1 (`2026-10-30-doctor-profile-bank-kyc-design.md`): verified bank and KYC details.

## Goal

Doctors select completed consultations and raise a settlement invoice. Finance admins approve or reject it, transfer the money manually, and record the payment. TDS is deducted automatically for Indian doctors. Everything flows through the existing payout ledger, so a consultation can never be paid twice.

## Decisions already made

- Money moves by **manual bank transfer**. The platform records it; no payout provider.
- **TDS auto-deducted for bank country IN** at a platform setting rate (default 10%, Section 194J), on every invoice. The yearly threshold is not tracked. A TDS report CSV goes to the accountant.
- Invoices **reuse `doctor_payouts` / `payout_items`** (the one-ledger-entry-one-payout uniqueness) rather than a parallel table.

## Data model (one new migration)

### `doctor_payouts` changes

| Change | Notes |
|---|---|
| `batch_id` becomes nullable | invoices have no batch; add `check ((source = 'batch') = (batch_id is not null))` |
| `source text not null default 'batch'` | `'batch'` \| `'invoice'` |
| `invoice_number text unique` | `INV-YYYY-NNNNNN` from a sequence `invoice_number_seq`, set for invoices only |
| `gross_amount bigint` | sum of the selected ledger entries (earnings net of commission, minus refund reversals) |
| `tds_rate_bps integer not null default 0`, `tds_amount bigint not null default 0` | |
| `amount` | existing column = **net payable** = `gross_amount − tds_amount` (> 0) |
| `bank_snapshot jsonb` | copy of the doctor's private details at submission (country, holder, bank, account, IFSC/sort/routing, account type, PAN/GSTIN/tax id) |
| `rejection_reason text ≤ 1000` | |
| `submitted_at timestamptz` | |

Existing statuses are reused: `pending` = Submitted, `under_review`, `approved`, `paid`, `failed` = **Rejected** for invoices (the UI label differs by source). Withdraw by the doctor is a new transition `pending → cancelled`. This needs one new enum value, `cancelled`, and it releases the items like `failed` does.

### Ledger link

An invoice's `payout_items` are the selected `consultation_earning` entries plus any `refund_reversal` entries for the same appointments that are not yet in a payout. `payout_items.ledger_entry_id` is already unique, so batches and invoices can't both include an entry.

### Settings

`platform_settings`:
- `tds` = `{"rate_bps": 1000, "countries": ["IN"]}`
- `billing` = `{"company_name": "", "address": "", "gstin": "", "pan": "", "email": ""}`

Both editable on the admin settings page through the existing `update_platform_setting` RPC (settings.manage).

## RPCs

- `invoiceable_entries()`: doctor only. Returns the caller's ledger entries of type `consultation_earning` that are in no payout, joined to appointment reference, start time, mode, patient initials and currency, plus the matching unsettled refund reversals per appointment. Used by the selection screen.
- `submit_invoice(p_appointments uuid[]) returns doctor_payouts`, doctor only. Rules:
  - `doctor_private_details.kyc_status = 'verified'`, else `KYC_NOT_VERIFIED`
  - at least 1 appointment, else `NOTHING_SELECTED`
  - every appointment is the caller's, `completed`, with an earning entry not in any payout, else `ENTRY_NOT_INVOICEABLE`
  - all in one currency, else `MIXED_CURRENCY`
  - gross = sum of those earnings + their unsettled refund reversals; must be > 0, else `NOTHING_TO_PAY`
  - TDS = `floor((gross × rate_bps + 5000) / 10000)` (half-up) when `bank_country` is in the TDS countries, else 0
  - inserts the payout (source invoice, number, snapshot, submitted_at) and its payout_items under the per-doctor advisory lock
  - notifies `finance.manage` admins and audits `invoice.submit`
- `withdraw_invoice(p_payout uuid)`: owner only, status `pending` only (`NOT_PENDING`). Sets `cancelled` and deletes its payout_items.
- `reject_invoice(p_payout uuid, p_reason text)`: finance.manage. From `pending` / `under_review` / `approved`. Reason required. Sets `failed` and `rejection_reason`, releases items, notifies the doctor.
- Approve, under review and mark paid reuse `update_payout_status`. Paid requires a reference, as today, and the ledger `payout` entry is −`amount` (net). **TDS is recorded on the invoice, not as a ledger entry**, so the doctor's ledger balance after payment is gross − net = the TDS withheld. The earnings page shows this as "TDS withheld". `update_payout_status` gains no new behaviour except allowing `failed` to be reached from `approved` for invoices (needed for reject-after-approve).

## Screens

| Who | Where | What |
|---|---|---|
| Doctor | `/doctor/earnings` | Existing page gains tabs: Overview (existing) · **Raise invoice** · **Invoices** |
| Doctor | Raise invoice | Table of invoiceable consultations with checkboxes (select all), running gross, TDS (IN only), net; Submit disabled with a link to `/doctor/profile?tab=bank` unless KYC is verified |
| Doctor | Invoices | List: number, date, consultations count, net, status badge; Withdraw while Submitted |
| Doctor | `/doctor/invoices/[id]` | Printable invoice (print button, print CSS): doctor block (name, address, registration, PAN/GSTIN masked), billed-to block from `billing`, line items (date, reference, mode, fee, commission, your share; refund adjustments as negative lines), subtotal, TDS, net, bank (masked), status and payment reference when paid |
| Admin | `/admin/finance/invoices` | Queue with status filter (default Submitted), doctor, amounts; links to detail |
| Admin | `/admin/finance/invoices/[id]` | Same invoice document plus actions: Start review, Approve, Reject (reason), Mark paid (reference required, method, notes); full bank details via the existing audited Reveal |
| Admin | `/admin/finance` | Link to Invoices + "TDS report" CSV (`/api/tds-report?from=&to=`, finance.manage): invoice number, paid date, doctor, PAN, gross, TDS, net |
| Admin | `/admin/settings` | Billing details and TDS rate |

## Demo data

`supabase/demo/demo-invoices.sql`:
- marks 6 demo doctors' private details as verified with obviously fake details (`account_number` `000000000000`-style, `bank_name` "Demo Bank", PAN `DEMOP0000X`-style valid patterns)
- raises invoices for them in the states Submitted, Under review, Approved, Paid (reference `DEMO-UTR-…`) and Rejected
- cleanup already cascades from demo doctors. It is extended to delete demo payouts' items first, and the round trip in `db:check` covers it.

## Testing

- SQL tests `supabase/tests/08_invoices.sql`:
  - KYC not verified → refused
  - another doctor's / non-completed / already-invoiced appointment → refused
  - batch and invoice can't share an entry
  - TDS maths: IN 10% half-up; GB/US 0
  - refund reversal included
  - withdraw (owner, pending only) and reject release items so they're invoiceable again
  - paid needs a reference and writes −net to the ledger
  - non-finance admin can't approve or reject
  - doctor can't read another doctor's invoice
- Unit test for the client-side preview maths (`invoiceTotals(entries, tdsRateBps, applyTds)`) mirroring the SQL.
- Demo round trip extended with demo invoices, and cleanup leaves no trace.
- Typecheck, lint, build; migration pushed to live **with the user's OK** before the preview.

## Out of scope

- Automated transfers, bank-file exports (NEFT bulk files), PDF generation (the browser's print-to-PDF is used).
- TDS threshold tracking, Form 16A generation, GST invoices from doctors.
- Partial payments of an invoice.
