# 07 — Integrations Requiring External Credentials or Infrastructure

| Integration | Needed for | Status without it | What to provide |
|---|---|---|---|
| **Supabase project** | Database, auth, realtime, storage: everything beyond the public pages | Public site renders (empty directory); portals and booking unavailable | Project URL, publishable key, secret key; run migrations |
| **Supabase custom SMTP** | Auth emails (verification, magic link, reset) from your domain at production volume | Supabase's default sender (heavily rate-limited, dev only) | SMTP credentials (e.g. Resend SMTP) |
| **Stripe** | Collecting consultation fees, upgrades, refunds | Payments shown as "not configured"; bookings can be reserved but expire unpaid. No fake success | `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, webhook endpoint |
| **Transactional email (Resend)** | Booking confirmations, reminders, reschedule/cancel/refund, onboarding, payout updates | Emails queued in `email_outbox`; console provider logs that they would be sent | `RESEND_API_KEY`, verified sender domain |
| **TURN relay** (coturn or managed) | Calls for users behind restrictive NATs/firewalls | STUN only: most calls connect, some fail (the app explains and offers chat) | `WEBRTC_TURN_URLS`, `WEBRTC_TURN_SECRET` (or static credentials) |
| **Scheduler** (Supabase pg_cron + pg_net) | Minute-level: payment-hold expiry, reminders, email retries, no-show handling, refund pushes | Vercel daily fallback only; expired holds are still released at booking time | `CRON_SECRET`; run `supabase/cron.sql.example` |
| **Payouts to doctors** | Actually transferring money | Admins record payouts made outside the platform (bank transfer etc.) with a mandatory reference | Future: payout provider (e.g. Stripe Connect, RazorpayX) behind the same ledger |
| **Custom domain** | Per-client branding | `*.vercel.app` domain | DNS access |
| **Legal counsel** | Privacy policy, terms, disclaimer, cross-border practice | Pages marked "Draft for legal review" | Reviewed documents |
