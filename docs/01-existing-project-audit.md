# 01 — Existing Project Audit

Audited: `docothink-landing` (untracked, no commits) and `docothink-admin` (2 commits: "initial commit", "code pushed"), 2026-10-29.

## Summary

Both projects are **Angular front-ends with no backend in either repo**. They call a REST API at `https://api.docothink.com/v1/` that is not included. As of the audit the API **fails its TLS handshake** (curl exit 60), so it is presumed offline. No database schema, migrations or dump exist. The real content of value is UI copy, the specialty and condition lists, the doctor profile shape, and the patient medical questionnaire.

 
| | Landing | Admin |
|---|---|---|
| Framework | Angular 15, Bootstrap 5 alpha, jQuery, Owl Carousel, AOS, Angular Material | Angular 12 (EOL), "Minia" admin theme, ng-bootstrap, Material, Firebase 8, PeerJS, socket.io |
| Backend | External REST (`/doctor`, `/patient`, `/specialistDoctors`) | Same external REST, ~60 service files; most belong to other projects (spare parts, poker, call centre) |
| Auth | None. Signup only; "Login" opens the admin URL in a new tab | Client-side only: `sessionStorage` user object; route guard uses the theme's fake auth service |
| Tests | Default CLI `.spec.ts` stubs only | Default stubs only |

## 1. What the landing website does

- **Home** (`home/`, ~1,700 lines of markup): hero, specialist carousel, "most searched conditions" carousel, testimonials, 21-item FAQ, "someone to talk to" section.
- **Doctor directory** (`available-doctors/`): fetches up to 2,000 ACTIVE doctors client-side. Filters are decorative (`Item 1/2/3` placeholders). Hardcoded star rating of 4.
- **Doctor details** (`doctors-details/:id`): name, category, degree, address, fees `{video, phone, query}` in ₹, member since, specialist[], skills[], education[], experiences[], about. "Download CV" links to a non-existent `/images/sample.pdf`. Awards section is lorem ipsum.
- **Signup** (doctor or patient): first/middle/last name, contact, email, city, address, username. **The password field is bound to the username control** (password == username). Creates the record directly with `status: ACTIVE` and no verification.
- **Content pages**: About, Contact (form not wired), Ayurveda, Women's health, Child care (folder named `child-care-page copy`), Mental health + "more conditions", Blogs (static), Privacy policy, Terms.
- **Dashboard** (`/dashboard`): static mock-up, no data.

## 2. What the admin panel does

Docothink-specific modules (everything else is theme demo or code from unrelated projects):

| Module | Purpose | Real state |
|---|---|---|
| `d-doctor-create` | Admin CRUD of doctors: profile, skills, specialist, education, experience, availabilities, fees `{query, phone, video}`, `feesToDisplay`, recommended, queryTeamMember | API-backed. City/state/specialization lists hardcoded (Delhi/Ahmedabad, 2 specialisations) |
| `d-patient` (+ `appointment-details`) | Patient CRUD incl. full medical questionnaire | API-backed |
| `d-appointment` | Appointments: department, contact preference, date, time from fixed 10:00–17:30 list, assigned doctor, totals, discount, tax, notes, query/queryAnswer, `videoPhoneURL`, `doctorPrescription` (free text) | API-backed; slot list hardcoded; no conflict check |
| `d-assign-doctor`, `d-patient-query` | Assign doctor to patient query | Partly dummy data |
| `d-discount` | Discount codes (code, %, amount, validity) | API-backed |
| `d-invoice`, `d-claim-settlement` | Invoices; doctor settlement totals | **Dummy data**; PDF via html2canvas screenshot |
| `doctor-panel/*` | Today/upcoming/history appointments, query consultation, phone/video consultation, earnings, availability, chat | Downloads **all** appointments and filters by doctor ID in the browser. Availability is a hardcoded array (and not linked in the menu). Earnings sum `totalAmount` with no commission |
| `audio-video-call` | Video/audio rooms | PeerJS (public PeerJS cloud broker) + a socket.io signalling server that is not in the repo. No auth on rooms |
| `d-chats` | Chat | Messages stored as a `chats` array on the patient document, saved by full-document PUT. No realtime |
| CMS: `d-specialist-doctors`, `d-medical-conditions`, `d-someone-to-talk-to`, `d-testimonials`, `d-blogs-news`, `d-banner`, `d-notification` | Website content management | API-backed CRUD |
| Dashboards (admin/doctor/patient) | KPI cards | Mostly static |

## 3. Functional / incomplete / missing

- **Functional (if the API were up):** doctor and patient CRUD, appointment CRUD, discounts, CMS lists, doctor profile display.
- **Incomplete:** availability (mock), claim settlement and invoices (mock), doctor directory filters (decorative), patient dashboard (static), video (works only peer-to-peer via a third-party broker, no TURN), chat (not realtime).
- **Missing entirely:** real authentication, email verification, password reset, RBAC, time zones (all times are naive strings like `"10:00 AM"`), slot conflict prevention, payments (`ngx-paypal` installed, unused), commission, payouts ledger, reschedule approval workflow, doctor onboarding/verification, document storage, structured prescriptions, audit logs, notifications/email.

## 4. Security findings (must not be carried forward)

1. **Hardcoded long-lived JWT** (`exp` 2026-02) committed in all three landing services as `x-auth-token`. Treat as compromised; revoke if the old API ever returns.
2. **Google OAuth client secret** committed in `landing/src/environments/environment.prod.ts` (copied from an unrelated "rico" project). Rotate it.
3. **Google Maps API key** and a Knowlarity `apiKey` committed in the admin repo.
4. Password == username on signup; accounts created ACTIVE with no verification.
5. Authorization is purely client-side (sidebar hides menu items by role). Any logged-in user, or anyone with the token, can read all patients and appointments.
6. All patient medical data is pulled to the browser in bulk (`getAll(2000, 0)`) and filtered client-side.
7. Video rooms are joinable by anyone who knows the room ID.
8. Angular 12 is end-of-life; the admin `package.json` pins many vulnerable transitive dependencies.

## 5. What to reuse

| Asset | Source | Destination |
|---|---|---|
| Specialty list (16: Dietitian, Gynaecologist, Obstetrician, Cardiologist, Dentist, Dermatologist, Sexology, General Physician, Pulmonology, Urology, Pediatrics, HIV/AIDS, Diabetology, Neurology, Cosmetology, + admin departments: Allergy, ENT, Gastro/Hepatology, Eye) | `home.component.ts`, `d-appointment` | `specialties` seed |
| Specialty icons (`assets/images/doctors/*.png`) | landing assets | `public/specialties/` |
| Common conditions (22: Covid-19, PCOD, BP, Diabetes, Depression, Hair loss…) | `home.component.ts` | `conditions` seed, linked to specialties |
| 21 patient FAQs | `faq.component.ts` | `/faq` page (copy reviewed: OTP and "system will recommend a specialist" items edited to match real features) |
| Consultation modes: query/chat, phone, video, fees per mode | doctor model | `consultation_mode` enum: `chat`, `audio`, `video` |
| Doctor profile shape: education[], experiences[], skills, languages, about, recommended | doctor model | `doctor_profiles`, `doctor_education`, `doctor_experience` |
| **Medical questionnaire**: drug allergies, past illnesses, operations, current medications (name + dose), habits (exercise, diet, alcohol, caffeine, smoking), reason for visit, past surgeries/hospitalisations (procedure, date, complications), family history (relative, condition, living, age if deceased), and a 12-system **review of systems** (~100 symptoms) | `signup-page.component.ts` patient object | `patient_medical_profiles` (structured JSONB per section) with a typed schema in `src/features/medical-profile` |
| Vitals arrays (BP, heart rate, glucose, blood count) | patient model | deferred: `patient_vitals` table in a later phase |
| Discount codes | `d-discount` | deferred (out of scope for v1 per the brief; schema leaves room) |
| CMS content types (testimonials, blogs, conditions, "someone to talk to") | admin CMS | Static content files for v1 public site; DB-backed CMS deferred |
| Page copy (About, Ayurveda, Women's health, Mental health, Child care, Privacy, Terms) | landing | Ported and edited for the new brand voice; legal pages flagged for lawyer review |

## 6. What must be rebuilt

Authentication, RBAC, scheduling/availability, booking with conflict protection, time zones, payments, commission, earnings, payouts, chat (realtime), video/audio (native WebRTC, authenticated signalling, TURN-ready), prescriptions (structured), document storage, notifications, audit logs, admin dashboards. None of the legacy implementations of these are safe or complete enough to port.

## 7. Preserved information checklist

- [x] Every specialty and condition name in the legacy code
- [x] Every medical-questionnaire field
- [x] Every doctor-profile field with a real purpose (dropped: `fatherName`, `gstin`, `stateCode`, `region`, `location`; they were always null)
- [x] Fees per consultation mode
- [x] FAQ content
- [x] Appointment fields: query text, doctor notes, prescription, discount/tax columns (tax kept as a nullable line in payments)

## 8. Migration risks

| Risk | Mitigation |
|---|---|
| No legacy data reachable | Decision: start fresh with dev-only seed data |
| No live Supabase project yet | Migrations written for the Supabase CLI; pure-logic tests (time zones, pricing, state machines) run without a DB; RLS test script provided to run once a project exists |
| WebRTC without TURN fails for roughly 10–20% of users behind symmetric NAT | TURN config is env-driven; coturn self-hosting documented |
| Healthcare compliance (HIPAA, UK GDPR/DSPT) | Documented as an operational checklist; no compliance claims made |
