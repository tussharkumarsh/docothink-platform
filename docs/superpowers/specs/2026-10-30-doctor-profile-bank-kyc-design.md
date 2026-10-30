# Doctor profile, bank account and KYC: design (Part 1 of 2)

Date: 2026-10-30 · Status: approved in conversation, awaiting written-spec review
Part 2 (separate spec): doctor settlement invoices → admin approval → manual bank transfer.

## Goal

1. Give doctors a complete professional profile, matching what patients see on market leaders (Practo: services, awards, education with institutions and years, memberships, experience roles, registrations).
2. Collect the private details needed to pay doctors and meet tax obligations (address, bank account, PAN/TIN), verified by an admin, so that Part 2 invoices always pay a verified account.

## Decisions already made

- Settlement money moves by **manual bank transfer** outside the platform (Part 2). No payout provider.
- Part 1 comes first; invoices (Part 2) require verified bank and KYC.
- **Aadhaar numbers are never stored** (Aadhaar Act restrictions). Identity stays on the existing ID-document upload.
- Whether Indian invoices auto-deduct TDS is decided in Part 2. Part 1 collects PAN so either choice works.

## Data model (one new migration)

### Public professional details: new columns on `doctor_profiles`

All are optional, readable wherever the doctor profile is (approved doctors: public), and editable by the doctor (added to the existing column grant).

| Column | Type | Notes |
|---|---|---|
| `special_interests` | `text[]` ≤ 15 items, each ≤ 80 chars | sub-specialties, e.g. "Paediatric dermatology" |
| `services` | `text[]` ≤ 40 items, each ≤ 120 chars | "Acne treatment", "Hair-loss consultation" |
| `skills` | `text[]` ≤ 30 items, each ≤ 80 chars | conditions/skills, shown as tags |
| `awards` | `jsonb` array of `{title, organization?, year?}` ≤ 20 | |
| `memberships` | `jsonb` array of `{organization, role?, since?}` ≤ 20 | |
| `publications` | `jsonb` array of `{title, journal?, year?, url?}` ≤ 30 | `url` must be http(s) |
| `practice_started_year` | `smallint` 1950–current year | lets the profile say "X years overall" |

`education` and `experience` already exist as jsonb. They get the same structured editor; `experience` items gain optional `from_year` and `to_year` alongside the existing free-text `years`.

### Private details: new table `doctor_private_details`

One row per doctor. Readable and writable only through RLS and RPCs (below), never public.

| Column | Notes |
|---|---|
| `doctor_id` pk fk → doctor_profiles | |
| address: `address_line1`, `address_line2`, `city`, `region`, `postal_code`, `country` | `country` 2-letter |
| `account_holder_name`, `bank_name` | |
| `bank_country` | IN / GB / US (drives which fields are required) |
| `account_number` | IN 9–18 digits; GB 8 digits; US 4–17 digits |
| `ifsc` | IN only, `^[A-Z]{4}0[A-Z0-9]{6}$` |
| `sort_code` | GB only, 6 digits |
| `routing_number` | US only, 9 digits |
| `account_type` | US only: checking / savings |
| `pan` | IN only, `^[A-Z]{5}[0-9]{4}[A-Z]$` |
| `gstin` | IN, optional, 15 chars |
| `tax_id` | US only (SSN/EIN), 9 digits |
| `bank_proof_path` | storage path of a cancelled cheque / bank statement (private bucket `doctor-credentials`) |
| `kyc_status` | `not_submitted` \| `pending` \| `verified` \| `changes_requested` |
| `kyc_note` | admin note for "changes requested", ≤ 1000 |
| `verified_by`, `verified_at`, `submitted_at`, `updated_at` | |

Rules (SQL, enforced on write):
- `save_private_details(...)` (doctor RPC): validates country-specific fields with the patterns above, rejects mismatched fields (e.g. IFSC on a GB account), and sets `kyc_status = 'pending'` and `submitted_at = now()` **whenever any bank or tax field changes**. Changing only the address keeps the current status.
- `review_private_details(p_doctor, p_decision 'verify'|'request_changes', p_note)`: admins with `finance.manage`. `request_changes` requires a note. Audited. Notifies the doctor.
- Read access: the doctor reads their own row. Admins with `finance.manage` read **masked** values through the view `admin_doctor_bank_masked` (account number shown as `••••` + last 4, PAN as first 2 + `••••` + last 2). Full values come only from `reveal_bank_details(p_doctor)` (finance.manage), which writes an audit entry `bank.reveal`.

## Screens

| Who | Where | What |
|---|---|---|
| Doctor | `/doctor/profile` | Tabs: **Public profile** (existing fields) · **Professional details** (education, experience, special interests, services, skills, awards, memberships, publications) · **Address** · **Bank & tax** (country-aware form, proof upload, status badge, admin note when changes are requested, banner "Saving new bank details sends them for re-verification") |
| Doctor | `/doctor` dashboard | "Profile completeness" card: professional sections filled, address, bank & tax verified; links to the missing tab |
| Admin | `/admin/doctors/[id]` | **Bank & KYC** panel: masked details, proof link, status, Reveal (audited), Verify / Request changes with note |
| Admin | `/admin/doctors` | Filter "KYC pending" |
| Public | `/doctors/[slug]` | New sections, each shown only when filled: Special interests, Services & treatments, Awards & recognitions, Memberships, Publications; experience line "X years overall" from `practice_started_year` |

## Demo data

The demo seed adds specialty-appropriate special interests, services, skills, 0–2 awards and 1–2 memberships to demo doctors, via an **additive script `supabase/demo/enrich-demo-profiles.sql`** for the already-seeded live data, also called at the end of `seed-demo.sql` for future runs. No demo bank, tax or address data is created.

## Testing

- SQL tests (`supabase/tests/07_private_details.sql`): country validation (valid and invalid IFSC, PAN, sort code, routing, account length; mismatched fields rejected); bank change resets a verified status to pending, address-only change doesn't; other doctors, patients and anon can't read the row; non-finance admins can't read or review; the masked view never contains a full account number; reveal writes an audit entry; `request_changes` without a note is rejected.
- Unit tests: client-side mirrors of the validation patterns (shared constants) and the profile-completeness calculation.
- Demo round trip in `db:check` extended: the enrich script runs, and cleanup still leaves no trace.
- Typecheck, lint, build, then a Vercel preview before merge.

## Out of scope

- Automatic bank-account verification (penny drop) and PAN verification APIs.
- Aadhaar collection.
- Invoices and payouts (Part 2).
- Patient-facing filtering by services or skills (possible later).
