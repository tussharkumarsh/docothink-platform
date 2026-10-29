# 03 — Security, Privacy and Compliance Checklist

> This platform is **designed to support** healthcare privacy requirements. It is **not** HIPAA-, UK GDPR- or DSPT-compliant merely by using Supabase or this code. Compliance depends on contracts, configuration, operations and legal review, listed below.

## Implemented controls

| Area | Control | Where |
|---|---|---|
| Authorisation | RLS on every table; client roles start from zero privileges (`revoke all`) then get only what policies need | `20261029000007_rls.sql` |
| Privilege escalation | `role`, `is_active`, statuses, money and audit columns are not client-writable (column grants); signup can never create an admin | RLS migration, `handle_new_user()` |
| Critical writes | Booking, payment confirmation, cancellations, reschedules, prescriptions, ledger and payouts change only through `SECURITY DEFINER` RPCs that check `auth.uid()`/permissions | `20261029000006_rpcs.sql` |
| Server trust | Fees, commission, amounts, slot validity and status transitions are computed in Postgres; browser input is never trusted | `book_appointment`, `create_payment_record`, `assert_slot_bookable` |
| Payments | Confirmed only by a signature-verified webhook; event de-duplication; amount/currency check; idempotency keys | `/api/webhooks/stripe`, `confirm_payment` |
| Clinical access | Patient, treating doctor (confirmed+ appointment), explicit patient share or audited admin referral, or admin with `clinical.read` | `doctor_has_clinical_access()`, `can_read_patient_clinical()` |
| Admin least privilege | Granular permissions; account admins can't see clinical data without `clinical.read` | `admin_permissions`, `appointment_intakes` split |
| Files | Private buckets; random object names (no names or titles in paths); type/size validation; signed upload URLs; 60-second signed download URLs after an RLS check | `register_document_upload`, `/api/files/[kind]/[id]` |
| Audit | Append-only `audit_logs` (record views, document access, approvals, refunds, payouts, settings, access grants) with no clinical content | `audit_as()`, trigger `prevent_mutation` |
| Immutability | Finalised prescriptions immutable (amend = new version, SHA-256 fingerprint); ledger append-only; commission rules append-only | triggers |
| Realtime | Chat via `postgres_changes` (RLS-filtered); WebRTC signalling on **private** channels authorised by RLS on `realtime.messages` | storage/realtime migration |
| Calls | Peer-to-peer DTLS-SRTP; not recorded; TURN credentials short-lived (HMAC) | `src/lib/webrtc` |
| Secrets | Secret key only in `server-only` modules; `.env*` git-ignored; nothing secret in `NEXT_PUBLIC_*` | `src/lib/supabase/admin.ts` |
| Sessions | Supabase SSR cookies; JWT verified with `getClaims()`; role and permissions re-read from the database per request; deactivated users blocked | `src/lib/auth/viewer.ts` |
| Abuse | Postgres-backed rate limits on login, sign-up, magic links, password reset, uploads; uniform auth errors (no account enumeration) | `check_rate_limit`, `features/auth/actions.ts` |
| Redirects | Only same-site relative `next` paths are honoured | `safeNext`, `/auth/callback` |
| Email | No clinical content or attachments; authenticated links only; HTML-escaped; idempotent per event | `src/lib/email` |
| Logging | Logs carry error codes, never notes, tokens or documents; Stripe metadata holds opaque ids only | throughout |
| Headers | HSTS, nosniff, frame-deny, referrer policy, Permissions-Policy limiting camera/mic to our origin | `next.config.ts` |
| CSV export | Formula-injection neutralised | `/api/statements` |

## Legacy issues fixed (from the audit)

Hardcoded JWT and OAuth client secret in the legacy repos (**rotate/revoke them**); password = username; client-only authorisation; bulk download of all patient data; unauthenticated video rooms.

## Before real patients use the service

**Contracts & hosting**
- [ ] US: HIPAA requires a **BAA** with every processor of PHI. Supabase offers HIPAA support with a BAA on its paid plans plus its HIPAA add-on and configuration; confirm current terms. Vercel: confirm BAA availability for your plan, or keep PHI off Vercel logs (the app already avoids logging PHI). Stripe isn't a business associate for payment processing; keep PHI out of Stripe metadata (done). The email provider needs a BAA, or emails must contain no PHI (current templates include names and appointment times; review whether that counts as PHI for your use).
- [ ] UK: UK GDPR + DPA 2018: lawful basis and Article 9 condition for health data, DPIA, privacy notice, ROPA, international transfer mechanism (IDTA/addendum) for India-based doctors and US hosting. CQC registration may be required for regulated activities in England; NHS DSPT if working with the NHS.
- [ ] India: Digital Personal Data Protection Act 2023 obligations; Telemedicine Practice Guidelines (2020) for Indian-registered doctors, including identification and consent requirements.
- [ ] Cross-border practice: confirm doctors may legally consult patients in the patient's jurisdiction (US state licensure, GMC registration for UK patients), and prescription validity across borders. **This is a major regulatory question for the business model.**
- [ ] Doctor agreement (independent-contractor status, indemnity insurance, commission, data processing).

**Configuration**
- [ ] Supabase: PITR backups, SSL enforcement, network restrictions, MFA for dashboard users, Realtime "private channels only", custom SMTP, Advisors all green.
- [ ] Enable MFA (TOTP) for admin and doctor accounts (Supabase Auth supports it; an enforcement UI is a recommended next step).
- [ ] Rotate the legacy secrets found in the audit.
- [ ] TURN server with TLS (`turns:`) and denied private IP ranges.

**Operations**
- [ ] Retention schedule (medical records are commonly 7–10+ years, longer for minors) and a purge/anonymise job. Account erasure = deactivate + anonymise; clinical and audit records are retained under legal obligation (the append-only audit log intentionally blocks hard deletion).
- [ ] Incident response and breach notification process (HIPAA 60 days; UK GDPR 72 hours).
- [ ] Access reviews of admin permissions; periodic audit-log review.
- [ ] Penetration test before launch.
- [ ] Legal review of Privacy Policy, Terms and Medical Disclaimer (pages are marked as drafts).
- [ ] Consent wording at booking (telehealth consent per jurisdiction).
- [ ] Call recording stays **off**. Enabling it needs separate consent, storage and retention design.
