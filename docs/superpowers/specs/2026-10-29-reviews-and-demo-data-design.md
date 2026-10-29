# Reviews and demo data: design

Date: 2026-10-29 · Status: approved in conversation, awaiting written-spec review

## Goal

1. Give Docothink **verified patient reviews**: the strongest trust signal on iCliniq, Practo and Zocdoc (see `docs/05-competitor-analysis.md`, Phase 2). The feature must work for real patients, not only for the demo.
2. Fill the live database with a **removable demo dataset** (about 64 doctors, 240 patients, 600 appointments, reviews) so the platform can be shown to prospective clients as a busy, realistic marketplace.

## Decisions already made

- Demo data goes into the **current (live) Supabase project**, because the site hasn't launched and still runs in test payment mode. Every demo record is tagged, the site shows a "Demo data" notice while any exist, and one script removes it all.
- Reviews are **built first**, then seeded.
- No real people: fictional names, initials avatars, registration numbers prefixed `DEMO-`, emails on the reserved `demo.docothink.test` domain (undeliverable by design).

## Part A: Reviews

### Data model (new migration)

`public.doctor_reviews`

| Column | Type | Notes |
|---|---|---|
| `id` | uuid pk | |
| `appointment_id` | uuid, unique, fk → appointments | one review per appointment |
| `doctor_id`, `patient_id` | uuid fk → profiles | copied from the appointment |
| `rating` | smallint, check 1–5 | |
| `comment` | text, nullable, ≤ 1000 chars | |
| `is_anonymous` | boolean, default false | shows "Anonymous patient" instead of a name |
| `comment_status` | text: `none` \| `pending` \| `approved` \| `hidden` | `none` when there's no comment |
| `moderated_by`, `moderated_at` | admin + time | |
| `created_at` | timestamptz | |

On `public.doctor_profiles`: `rating_avg numeric(3,2)` and `rating_count integer default 0`, maintained by a trigger on `doctor_reviews` insert, update and delete. Hidden reviews still count toward stars: moderation acts on comment text only.

### Rules (enforced in SQL)

- `submit_review(p_appointment, p_rating, p_comment, p_anonymous)`, a SECURITY DEFINER RPC. The caller must be the appointment's patient. The appointment must be `completed` and have ended within the last 30 days, with no existing review. A comment starts `pending`.
- `moderate_review(p_review, p_status)`: admins with `reviews.manage` (or `*`) only. Audited.
- RLS: the public can read **approved** comments and every rating, through a view `public_doctor_reviews`. It exposes the first name and last initial (or "Anonymous patient"), the rating, the approved comment and the date. It never exposes the patient id. Patients read their own reviews; admins read everything.

### Screens

| Who | Where | What |
|---|---|---|
| Patient | `/patient/appointments/[id]` when completed | "Rate your consultation": 1–5 stars, optional comment, "post anonymously". After submitting: "Thanks; your comment will appear once reviewed." |
| Public | Doctor card | ★ 4.8 (123), hidden while the doctor has no ratings |
| Public | Doctor profile | Rating summary (average, count, 5→1 distribution) and the latest approved comments with a "Verified patient" badge |
| Public | Find a doctor | New sort: "Highest rated" (doctors with no ratings last) |
| Doctor | `/doctor` dashboard | Average rating stat and the 5 most recent reviews; comments are shown only once approved |
| Admin | New `/admin/reviews` | Pending comments queue (oldest first) with Approve / Hide; filters for status, doctor and rating; link to the appointment |

## Part B: Demo data

### Tagging and notice

- New column `public.profiles.is_demo boolean not null default false` (same migration). The seed sets it on every demo account.
- `platform_settings` key `demo` = `{ "enabled": true }`, set by the seed and removed by cleanup. While present, the site shows a slim notice under the header: "Demo data: doctors, patients and reviews shown here are fictional and for presentation only." Demo doctor cards and profiles show a small "Demo" badge. No redeploy is needed to switch it off.

### Generator: `supabase/demo/seed-demo.sql`

A single deterministic SQL script, run with `npx supabase db query --linked -f supabase/demo/seed-demo.sql`. It refuses to run if demo data already exists.

| Data | Amount and shape |
|---|---|
| Doctors | **64** across all 25 specialties (2–4 each, more for General Medicine, Dermatology, Gynaecology and Psychiatry). Country mix IN/GB/US with matching currency and time zone. Fictional names, specialty-appropriate qualifications and headline, 1–3 languages, 4–30 years' experience, fees for each offered mode, weekly hours on 3–6 days in their own zone, approved, `DEMO-` registration numbers. Photo: none, so the UI renders an initials avatar. |
| Patients | **240**, mixed countries and time zones, patient profile and a short medical profile. |
| Past appointments (last 60 days) | About **450**: ~85% completed, ~10% cancelled (refunded per policy), ~5% no-show. Inserted directly with the same column values `book_appointment` would produce (fee snapshot, commission, currency, both time zones). |
| Upcoming appointments (next 14 days) | About **150** confirmed, placed on real free slots of each doctor's rules. |
| Payments | A `manual` (test) succeeded payment for every paid appointment; refunds for cancellations. |
| Completed visits | Consultation record with joined/ended times; earnings through `public.post_consultation_earning()` so the ledger matches real visits; a short prescription for about half. |
| Reviews | About 60% of completed visits: ratings weighted to 4–5 (average ≈ 4.5), comments from specialty-appropriate templates, about 15% anonymous, comments pre-approved. |
| Showcase logins | 3 demo doctors and 3 demo patients with known passwords, listed in the run output. Every other demo account gets a random password. |

Notifications and email outbox rows created during seeding are deleted at the end, so no demo email is ever queued.

### Cleanup: `supabase/demo/cleanup-demo.sql`

Deletes, in dependency order, every row belonging to `is_demo` accounts (reviews, prescriptions, consultations and messages, ledger entries, refunds, payments, appointments, availability, specialties links, profiles, auth users), then removes the `demo` setting. It touches nothing linked to non-demo accounts. If a real patient has booked a demo doctor, the script stops and lists those appointments instead of deleting real data.

## Testing

- SQL tests (`supabase/tests/05_reviews.sql`, run by `npm run db:check`): review only for own completed appointment, only once, only within 30 days; comment hidden until approved; aggregate updates on insert and hide; public view never exposes patient ids.
- Unit tests: rating formatting and the "Highest rated" sort.
- Seed check: run `seed-demo.sql` then `cleanup-demo.sql` against the in-process database used by `db:check`, and assert that zero demo rows remain and the real seed accounts are untouched.
- Then typecheck, lint and build, and a Vercel preview before merging.

## Out of scope

- Doctor replies to reviews, review editing, review reporting by the public.
- Real photos for demo doctors.
- A separate demo environment (possible later: the same scripts can run against another project).
