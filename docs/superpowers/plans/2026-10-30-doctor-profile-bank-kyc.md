# Doctor Profile, Bank Account and KYC Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Doctors maintain a full professional profile plus private address, bank and tax details. Admins verify the bank and tax details, which Part 2 invoices will require.

**Architecture:** One migration adds public professional columns to `doctor_profiles`, a private `doctor_private_details` table (RLS: own row only), SQL RPCs for saving (with country validation and re-verification on bank change), review, masked admin reads and audited reveal. Next.js pages: a tabbed doctor profile, public sections, a completeness card and an admin Bank & KYC panel. A demo script enriches demo doctors' public sections.

**Tech Stack:** Next.js 16 (server actions, Cache Components), Supabase Postgres + RLS, Tailwind v4, zod, Vitest, PGlite `db:check`.

**Spec:** `docs/superpowers/specs/2026-10-30-doctor-profile-bank-kyc-design.md`

## Global Constraints

- Branch `doctor-profile-kyc`. Migration file `supabase/migrations/20261030000010_doctor_profile_kyc.sql`. Follow `20261029000007_rls.sql` and lessons from 0009: `revoke all … from anon, authenticated` on every new table/view (Supabase default privileges), SECURITY DEFINER + `set search_path = ''`, error codes via `raise exception 'CODE' using errcode = 'P0001'` (`'42501'` for authorisation), explicit `grant execute`.
- **Order:** the new code reads new columns, so the migration must reach the live DB **before** any preview or production build. Pushing it to live needs the user's explicit OK at that moment.
- Validation patterns (exact): IFSC `^[A-Z]{4}0[A-Z0-9]{6}$`; PAN `^[A-Z]{5}[0-9]{4}[A-Z]$`; GSTIN `^[0-9]{2}[A-Z0-9]{13}$`; account number IN `^[0-9]{9,18}$`, GB `^[0-9]{8}$`, US `^[0-9]{4,17}$`; sort code `^[0-9]{6}$`; routing `^[0-9]{9}$`; US tax id `^[0-9]{9}$`.
- Never store Aadhaar. Never log or render a full account number, PAN or tax id outside the doctor's own Bank & tax tab and the audited reveal.
- List limits: special_interests ≤ 15 × 80 chars; services ≤ 40 × 120; skills ≤ 30 × 80; awards ≤ 20; memberships ≤ 20; publications ≤ 30 (url http/https only).
- Admin permission for bank/KYC: `finance.manage`.
- Copy (exact): re-verification banner "Saving new bank or tax details sends them for re-verification. Invoices are paused until they're verified."

## Review Focus

1. **A doctor edits only the address of verified details:** the status must stay `verified` (test in Task 1).
2. **A doctor submits GB details with an IFSC or a PAN:** rejected with `MISMATCHED_FIELDS`, not silently stored (Task 1).
3. **A finance admin opens the doctor page:** only masked numbers appear in the HTML; the full number appears only after Reveal, and an audit row exists (Tasks 1 and 6).
4. **Demo cleanup after enrichment:** still leaves zero demo rows (Task 7).
5. **The existing public profile with none of the new sections filled:** renders exactly as before, with no empty headings (Task 4).

---

### Task 1: Migration and SQL tests

**Files:** Create `supabase/migrations/20261030000010_doctor_profile_kyc.sql`, `supabase/tests/07_private_details.sql`.

**Interfaces (Produces):**
- `doctor_profiles` + `special_interests text[] not null default '{}'`, `services text[] … '{}'`, `skills text[] … '{}'`, `awards jsonb not null default '[]'`, `memberships jsonb … '[]'`, `publications jsonb … '[]'`, `practice_started_year smallint null` (checks per Global Constraints: `cardinality`, per-element length via a helper `public.text_items_ok(text[], max_items int, max_len int) returns boolean immutable`, `jsonb_array_length`). Add these to the doctor's existing column `grant update (...) on public.doctor_profiles to authenticated`.
- `alter type public.credential_kind add value 'bank_proof'`. Bank proof is a `doctor_credentials` row of this kind, reusing the existing upload and admin open/verify flow. **This replaces the spec's `bank_proof_path` column.**
- `public.kyc_status` enum: `not_submitted`, `pending`, `verified`, `changes_requested`.
- table `public.doctor_private_details` (columns per spec minus `bank_proof_path`; `kyc_status default 'not_submitted'`), RLS on, `revoke all` from client roles, `grant select` to authenticated, policy: `doctor_id = auth.uid()`. No client insert/update grants.
- `public.save_private_details(p jsonb) returns public.kyc_status`: doctor only (`FORBIDDEN`). Keys: `address_line1, address_line2, city, region, postal_code, country, account_holder_name, bank_name, bank_country, account_number, ifsc, sort_code, routing_number, account_type, pan, gstin, tax_id`. Empty strings → null. Validates per Global Constraints → `INVALID_<FIELD>` (e.g. `INVALID_IFSC`). A field belonging to another bank country → `MISMATCHED_FIELDS`. If any bank/tax field differs from the stored row (`is distinct from`) **and** at least the core bank fields for that country are present → `kyc_status = 'pending'`, `submitted_at = now()`. Upserts. Returns the status.
- `public.review_private_details(p_doctor uuid, p_decision text, p_note text) returns void`: `has_permission('finance.manage')` else `FORBIDDEN`. `verify` (only from `pending`, else `NOT_PENDING`) or `request_changes` (note required → `NOTE_REQUIRED`). Sets `verified_by/verified_at` or `kyc_note`. Calls `public.audit('kyc.review', 'doctor', p_doctor::text, jsonb_build_object('decision', p_decision))` and `public.enqueue_notification(...)` for the doctor (match the existing signature in `20261029000005_finance_ops.sql`).
- view `public.admin_doctor_bank_masked` (security_invoker = false), filtered `where public.has_permission('finance.manage')`: doctor_id, address fields, account_holder_name, bank_name, bank_country, `'••••' || right(account_number, 4)` as account_masked, ifsc, sort_code, `'•••••' || right(routing_number, 4)`, account_type, pan masked `left(pan,2)||'••••'||right(pan,2)`, gstin, tax_id masked `'•••••'||right(tax_id,4)`, kyc_status, kyc_note, submitted_at, verified_at. Grant select to authenticated only.
- `public.reveal_bank_details(p_doctor uuid) returns table(account_number text, routing_number text, pan text, tax_id text)`: finance.manage only; `audit('bank.reveal', 'doctor', …)`.

- [ ] **Step 1: Write `07_private_details.sql`** (seed ids: Dr Mehta `…0101` IN, Dr Clarke `…0102` GB, Emily `…0201`, admin `…0001`). Assertions:
  - Mehta saves IN details (account `123456789012`, IFSC `SBIN0001234`, PAN `ABCDE1234F`) → returns `pending`
  - IFSC `SBIN1234` → `INVALID_IFSC`; PAN `ABCD1234F` → `INVALID_PAN`
  - Clarke saves GB details with `ifsc` set → `MISMATCHED_FIELDS`; valid GB (sort `123456`, account `12345678`) → `pending`
  - admin verifies Mehta → `verified`; Mehta changes only `city` → still `verified`; Mehta changes `account_number` → `pending`
  - `request_changes` with an empty note → `NOTE_REQUIRED`
  - Emily (patient) and Clarke reading Mehta's row → 0 rows; anon → permission denied on the table
  - an admin holding only `doctors.manage` (create one as in `05_reviews.sql`) → 0 rows from the masked view, `FORBIDDEN` from reveal and review
  - the masked view's `account_masked` for Mehta = `'••••9012'`, and no column of the view equals the full number
  - after admin `reveal_bank_details`, `audit_logs` has an `action = 'bank.reveal'` row
  - `doctor_profiles.services` accepts 40 items and rejects 41
- [ ] **Step 2: Run** `npm run db:check`. Expected: `07` FAILS (function missing).
- [ ] **Step 3: Write the migration.**
- [ ] **Step 4: Run** `npm run db:check`. Expected: all files and the demo round trip pass.
- [ ] **Step 5: Commit** `feat(db): doctor professional details, private bank/KYC details and review`.

### Task 2: Shared validation and completeness helpers

**Files:** Create `src/features/doctor/kyc.ts`, `src/features/doctor/kyc.test.ts`.

**Interfaces (Produces):**
- `KYC_PATTERNS` (the Global Constraints regexes as `RegExp`), `BANK_FIELDS: Record<"IN"|"GB"|"US", { required: string[]; optional: string[] }>` (IN required: `account_holder_name, bank_name, account_number, ifsc, pan`; optional `gstin`. GB required: `account_holder_name, bank_name, account_number, sort_code`. US required: `account_holder_name, bank_name, account_number, routing_number, account_type, tax_id`).
- `profileCompleteness(input: { education: number; experience: number; services: number; specialInterests: number; addressComplete: boolean; kycStatus: string }): { done: number; total: number; missing: { key: string; label: string; tab: "professional" | "address" | "bank" }[] }` with 5 items: Education, Experience, Services & treatments, Address, Bank & tax verified (special interests are not required).
- `parseLines(text: string, max: number, maxLen: number): string[]`: trims, drops blanks, de-duplicates case-insensitively, caps count, truncates nothing (over-long lines → error string returned separately as `{ items, error? }`).
- [ ] **Step 1: Tests:** each pattern accepts and rejects one example from Task 1; `profileCompleteness` with everything done → 5/5; with `kycStatus: 'pending'` → 4/5, missing `bank`; `parseLines("a\n\nA\nb", 10, 80)` → `{ items: ["a","b"] }`; an over-long line → `error` set.
- [ ] **Step 2: Run** `npx vitest run src/features/doctor/kyc.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement.** **Step 4: Run** again. Expected: PASS.
- [ ] **Step 5: Commit** `feat(doctor): KYC validation and profile completeness helpers`.

### Task 3: Doctor profile tabs and forms

**Files:** Modify `src/app/doctor/profile/page.tsx`, `src/features/doctor/actions.ts`; create `src/features/doctor/components/professional-form.tsx`, `address-form.tsx`, `bank-form.tsx`; modify `src/features/documents/actions.ts` and the uploader's credential kind union to allow `bank_proof`.

**Interfaces:**
- Tabs are links with `?tab=public|professional|address|bank` (server-rendered, no client state), default `public` (the existing `ProfileForm`).
- `updateProfessionalDetailsAction(_, formData)`: textareas one item per line for special interests, services, skills; awards/memberships/publications one per line as `Title — Organisation — Year` (same em-dash parsing as the existing education field); `practice_started_year` number. Uses `parseLines`; updates `doctor_profiles` via the user client; `revalidateTag("doctors","max")`.
- `saveAddressAction` / `saveBankDetailsAction(_, formData)`: zod-validate with `KYC_PATTERNS`, call `save_private_details` with the merged jsonb (address action sends only address keys plus the stored bank keys unchanged; bank action sends bank keys). Map errors via `friendlyError`: add messages for `INVALID_ACCOUNT_NUMBER, INVALID_IFSC, INVALID_PAN, INVALID_GSTIN, INVALID_SORT_CODE, INVALID_ROUTING_NUMBER, INVALID_TAX_ID, MISMATCHED_FIELDS, NOT_PENDING` with a unit test in `src/lib/errors.test.ts` written first.
- Bank tab: status badge, the exact re-verification banner when status is `verified`, the admin note when `changes_requested`, a country select that shows only that country's fields (separate `<fieldset>` per country, hidden by a `?country=` link, not JS), and the Uploader with `kind="bank_proof"` listing existing bank-proof files.
- [ ] **Step 1:** Errors test for the new codes (RED → GREEN).
- [ ] **Step 2:** Forms and actions.
- [ ] **Step 3: Run** `npm run typecheck && npm run lint && npm test`. Expected: clean.
- [ ] **Step 4: Commit** `feat(doctor): professional, address and bank & tax profile tabs`.

### Task 4: Public profile sections

**Files:** Modify `src/features/catalog/queries.ts` (`DoctorDetail` + select list gain the 7 new columns), `src/app/(site)/doctors/[slug]/page.tsx`; create `src/features/catalog/components/profile-sections.tsx`.

**Interfaces:** `ProfileSections({ doctor }: { doctor: DoctorDetail })` renders, in this order and only when non-empty: Special interests (tags), Services & treatments (list), Awards & recognitions, Memberships, Publications (title links when url). Header experience line: `"{years_experience} yrs as specialist · {now − practice_started_year} yrs overall"` when both exist.
- [ ] **Step 1:** Implement. Check the Review Focus #5 case by rendering with all-empty fields: no new headings appear.
- [ ] **Step 2: Run** `npm run typecheck && npm run lint`. Expected: clean.
- [ ] **Step 3: Commit** `feat(catalog): professional sections on public doctor profiles`.

### Task 5: Doctor dashboard completeness card

**Files:** Modify `src/app/doctor/page.tsx`.
- Reads `doctor_private_details` (own row) and the profile arrays; renders `profileCompleteness` as "Profile {done}/{total} complete" with links to `?tab=` for each missing item; hidden when 5/5.
- [ ] **Step 1:** Implement. **Step 2: Run** `npm run typecheck && npm run lint`. **Step 3: Commit** `feat(doctor): profile completeness card`.

### Task 6: Admin Bank & KYC panel

**Files:** Modify `src/app/admin/doctors/[id]/page.tsx`, `src/app/admin/doctors/page.tsx` (filter `kyc=pending` → doctors whose `admin_doctor_bank_masked.kyc_status = 'pending'`), `src/features/admin/actions.ts`; create `src/features/admin/components/bank-kyc-panel.tsx`.

**Interfaces:** `reviewKycAction(_, formData)` → `review_private_details`; `revealBankAction(formData)` → calls `reveal_bank_details` and renders the result **only in the action's response** (client component with `useActionState`, values never in the initial HTML). The panel shows only when `hasPermission(viewer, "finance.manage")`, the masked values, a status badge, a link to the bank-proof credential (existing signed-URL route `/api/files/credential/[id]`), and Verify / Request changes (note).
- [ ] **Step 1:** Implement. **Step 2: Run** `npm run typecheck && npm run lint && npm run build` (local build is valid only after the migration is live; until then typecheck + lint). **Step 3: Commit** `feat(admin): bank & KYC verification panel`.

### Task 7: Demo profile enrichment

**Files:** Create `supabase/demo/enrich-demo-profiles.sql`; modify `supabase/demo/seed-demo.sql` (call the same logic at the end: `\i` isn't available, so put the enrichment in a SQL function `public.demo_enrich_profiles()` **created and dropped inside the script**, or duplicate the block; prefer the self-contained DO block, kept in the enrich file and copied into the seed via a shared marker comment); modify `scripts/db/check.ts` round trip (run enrich after seed; assert every demo doctor has ≥ 3 services and ≥ 1 special interest; cleanup still leaves 0 demo rows).
- Content: per specialty, 4–6 services, 2–3 special interests, 4–6 skills; 0–2 awards ("Best Young Clinician Award (demo)" style, each marked "(demo)"); 1–2 memberships from a per-country list; `practice_started_year = current year − years_experience − 0..4`.
- Idempotent: only updates demo doctors whose `services = '{}'`.
- [ ] **Step 1:** Round-trip assertions (RED). **Step 2:** Script. **Step 3: Run** `npm run db:check` (GREEN). **Step 4: Commit** `feat(demo): enrich demo doctors' professional profiles`.

### Task 8: Verify, push migration (with consent), preview, merge, enrich live

- [ ] **Step 1:** `npm run db:check && npm run typecheck && npm run lint && npm test`. All clean.
- [ ] **Step 2: Ask the user**, then `npx supabase db push` (dry run first). Verify the new columns and table and that anon gets 401 on `doctor_private_details`.
- [ ] **Step 3:** `npm run build` against live (70+ pages); push the branch; Vercel preview `READY`. **Stop for user review.**
- [ ] **Step 4 (on "merge"):** fast-forward `main`, push; then `npx supabase db query --linked -f supabase/demo/enrich-demo-profiles.sql` and verify the counts.
