# Docothink Platform

Online medical consultation and treatment platform: public website, patient portal, doctor portal and admin portal in one Next.js app, backed by Supabase. Chat runs on Supabase Realtime and Postgres; audio/video uses native WebRTC with Supabase signalling. No chat or video SaaS.

Replaces the legacy Angular apps `docothink-landing` and `docothink-admin` (see `docs/01-existing-project-audit.md`).

## Stack

Next.js 16 (App Router, Cache Components) · React 19 · TypeScript (strict) · Tailwind CSS 4 · Supabase (Postgres 17, Auth, Realtime, Storage) · Zod · Temporal (polyfill) · Stripe · Vitest · PGlite (SQL tests)

## Quick start

```bash
npm install
cp .env.example .env.local   # add Supabase URL + keys
npm run dev
```

Without Supabase the public site still renders. Booking and portals need a Supabase project with the migrations applied (`docs/04-deployment.md`).

```bash
npm test           # unit tests
npm run db:check   # migrations + RLS/RPC SQL tests in in-process Postgres
npm run typecheck && npm run lint
```

Dev seed (never in production): `admin@docothink.test`, `dr.mehta@docothink.test` (Kolkata), `dr.clarke@docothink.test` (London), `dr.rivera@docothink.test` (New York), `emily@docothink.test`, `oliver@docothink.test`. Password `DevPassword123`.

## Documentation

| Doc | Contents |
|---|---|
| [01 Audit](docs/01-existing-project-audit.md) | What the legacy apps did, what was preserved, security findings |
| [02 Architecture](docs/02-architecture.md) | Structure, security model, scheduling, money, state machine, migration matrix, roadmap |
| [03 Security & privacy](docs/03-security-privacy.md) | Implemented controls and the pre-launch compliance checklist |
| [04 Deployment](docs/04-deployment.md) | Supabase, Vercel, Stripe, email, TURN, cron, custom domains |
| [05 Competitors](docs/05-competitor-analysis.md) | Benchmark and recommendations, with sources |
| [06 Testing](docs/06-testing.md) | Automated coverage, results, manual test checklist |
| [07 Integrations](docs/07-integrations.md) | Everything that needs external credentials or infrastructure |

## Layout

```
src/app/(site)      public website, doctor directory, booking
src/app/(auth)      login, sign-up, password reset
src/app/patient     patient portal
src/app/doctor      doctor portal
src/app/admin       admin portal
src/app/consult     consultation room (chat + WebRTC)
src/app/api         Stripe webhook, cron tick, secure file access, statements
src/features/*      domain modules (queries, server actions, components)
src/lib/*           auth DAL, Supabase clients, time zones, money, payments, email, WebRTC
supabase/           migrations, seed, SQL tests
```
