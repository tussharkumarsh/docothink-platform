# 04 — Setup and Deployment Guide

## Local development

```bash
npm install
cp .env.example .env.local      # fill in Supabase values (see below)
npm run dev                     # http://localhost:3000
```

Checks (no database needed):

```bash
npm run typecheck
npm run lint
npm test            # unit tests: time zones/DST, money/commission, state machine, TURN, emails, earnings
npm run db:check    # applies all migrations + seed to in-process Postgres 17 (PGlite) and runs SQL tests
```

The public site renders without Supabase. Portals require it.

## 1. Supabase project

1. Create a project (choose a region close to most patients, e.g. `eu-west-2` London or `us-east-1`). For real patient data, see the compliance notes in `03-security-privacy.md` before choosing a plan.
2. Link and push migrations:
   ```bash
   npx supabase login
   npx supabase link --project-ref <ref>
   npx supabase db push            # applies supabase/migrations/*
   ```
   **Do not run `supabase/seed.sql` against production.** It creates demo accounts with a known password. For a dev project: `npx supabase db reset --linked` (destructive) or paste `seed.sql` into the SQL editor.
3. Verify against the real database. Run the SQL test files in a **dev** project's SQL editor: first `supabase/tests/00_helpers.sql`, then each test wrapped in `begin; … rollback;`. Then check **Advisors** (security and performance) in the dashboard.
4. Generate exact TypeScript types for the live schema (optional, recommended):
   ```bash
   npx supabase gen types typescript --linked > src/lib/supabase/database.types.ts
   ```
   The app currently uses hand-written row types per feature, which match the migrations.
5. **Auth settings** (Authentication → Sign In / URL Configuration):
   - Site URL: `https://<your-domain>`
   - Redirect URLs: `https://<your-domain>/auth/callback`, plus `http://localhost:3000/auth/callback` for dev, plus any preview domains (`https://*-<team>.vercel.app/auth/callback`).
   - Email: confirm email **on**; secure password change **on**; minimum password length 10 with mixed case and digits (mirrors `supabase/config.toml`).
   - **SMTP**: configure custom SMTP (e.g. Resend SMTP) so auth emails come from your domain and aren't rate-limited by the default sender.
   - Email templates: defaults work (they use the PKCE `code` flow handled by `/auth/callback`). Branding the templates is recommended. Never put passwords in templates.
6. **Realtime** (Realtime → Settings): turn **off** "Allow public access" so only private channels work. Our signalling channels are private and authorised by RLS on `realtime.messages`.
7. **Storage**: buckets and policies are created by the migrations (`medical-documents` and `doctor-credentials` private, `avatars` public).
8. **First admin**: sign up normally, then in the SQL editor:
   ```sql
   update public.profiles set role = 'admin' where email = 'you@example.com';
   insert into public.admin_permissions (user_id, permission)
   select id, '*' from public.profiles where email = 'you@example.com';
   ```
   Grant narrower permissions (`doctors.manage`, `finance.manage`, `clinical.read`, …) to other staff.

## 2. Vercel

1. Import the repository in Vercel (framework: Next.js). The Node.js runtime is required (Cache Components).
2. Set environment variables from `.env.example` for Production (and Preview with **separate** dev keys):
   `NEXT_PUBLIC_SITE_URL`, `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SECRET_KEY`, `CRON_SECRET`, and optionally Stripe, email and TURN.
   Leave `PAYMENTS_DEV_SIMULATION` unset in production (it's ignored in production builds anyway).
3. Deploy. The first deployment works on the free `*.vercel.app` domain.
4. **Background jobs**: `vercel.json` registers a daily fallback cron (the Hobby plan only allows daily). For minute-level jobs (payment-hold expiry, reminders, email retries, no-show handling), run `supabase/cron.sql.example` in the Supabase SQL editor (pg_cron + pg_net, free).

## 3. Stripe (when ready)

1. Create the account, then use **test mode** first.
2. Set `STRIPE_SECRET_KEY`.
3. Developers → Webhooks → add endpoint `https://<your-domain>/api/webhooks/stripe` with events:
   `checkout.session.completed`, `checkout.session.async_payment_succeeded`, `checkout.session.async_payment_failed`, `checkout.session.expired`, `refund.created`, `refund.updated`.
4. Copy the signing secret into `STRIPE_WEBHOOK_SECRET`. Redeploy.
5. Test: book, pay with the `4242 4242 4242 4242` card, and confirm the appointment flips to Confirmed only after the webhook. Then cancel and check the refund.
   Local testing: `stripe listen --forward-to localhost:3000/api/webhooks/stripe`.
6. Confirm that INR/GBP/USD are enabled for the account, and check regional rules: Indian Stripe accounts need approval for international cards, and doctors in India may require a separate payout setup.

## 4. Email

Set `EMAIL_PROVIDER=resend`, `RESEND_API_KEY`, `EMAIL_FROM` (verify the domain in Resend: SPF/DKIM). Until then, emails are queued in `email_outbox` and the console provider only logs that they would be sent. Check `email_outbox` for `status='failed'` rows.

## 5. TURN relay (for reliable calls)

Peer-to-peer works for most home networks, but symmetric NATs, mobile carriers and corporate firewalls need a relay. Options (provider-independent):

- **Self-host coturn** on a small VM (≈ US$5–10/month; bandwidth is the main cost: roughly 1–2 Mbps per relayed video call):
  ```
  listening-port=3478
  tls-listening-port=5349
  fingerprint
  use-auth-secret
  static-auth-secret=<same as WEBRTC_TURN_SECRET>
  realm=turn.your-domain.com
  cert=/etc/letsencrypt/live/turn.your-domain.com/fullchain.pem
  pkey=/etc/letsencrypt/live/turn.your-domain.com/privkey.pem
  no-multicast-peers
  denied-peer-ip=10.0.0.0-10.255.255.255
  denied-peer-ip=172.16.0.0-172.31.255.255
  denied-peer-ip=192.168.0.0-192.168.255.255
  ```
  Then set `WEBRTC_TURN_URLS=turn:turn.your-domain.com:3478?transport=udp,turns:turn.your-domain.com:5349?transport=tcp` and `WEBRTC_TURN_SECRET`.
- **Managed TURN** that supports the TURN REST/shared-secret scheme: just set the same two variables.

The app mints 1-hour per-user credentials server-side, so no long-lived TURN password reaches the browser.

## 6. Custom domain per client

1. Vercel → Project → Domains → add `app.clinic.com`, then create the DNS records Vercel shows (CNAME `cname.vercel-dns.com` or A records).
2. Update `NEXT_PUBLIC_SITE_URL`, the Supabase Site URL and Redirect URLs, the Stripe webhook URL, the pg_cron URL, and the email sender domain.
3. Redeploy.

For a separate client (separate data), deploy a separate Vercel project and a separate Supabase project from the same repository. This keeps each clinic's health data isolated, which is the simplest compliance boundary. Set per-client branding in Admin → Platform settings.

## What can't run on Vercel serverless (and how it's handled)

| Need | Approach |
|---|---|
| Media relay (TURN) | External coturn VM or managed TURN; Vercel only issues credentials |
| WebRTC signalling | Supabase Realtime (no long-lived sockets on Vercel) |
| Minute-level scheduled jobs | Supabase pg_cron + pg_net calling `/api/cron/tick` |
| Long-running retries | Email outbox and refund rows in Postgres, retried by the tick; every step is idempotent |
