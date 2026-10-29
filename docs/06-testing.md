# 06 — Testing Strategy and Results

## Automated (run on every change)

| Command | What it covers | Status (2026-10-29) |
|---|---|---|
| `npm test` | Vitest: slot generation and DST (India→New York, India→London across both 2026 changes, spring-forward gap, fall-back overlap, cross-midnight dates, 24:00 windows, buffers, notice, horizon, busy time); commission maths (₹1,000 → ₹100/₹900, rounding, parts sum to gross); cancellation policy; appointment state machine; earnings summary; email time-zone labels and escaping; TURN credentials | **25/25 pass** |
| `npm run db:check` | All migrations + seed applied to Postgres 17 (PGlite) with Supabase stubs, then SQL suites: RLS isolation and privilege escalation; anonymous visibility; booking, double-booking (RPC and raw insert), off-grid and too-soon slots; payment amount from DB, webhook idempotency, amount mismatch, upgrades; cancellation refunds and refund completion; consultation join/start/complete; chat authorisation, impersonation and duplicate prevention; private signalling channel access; prescription drafts, immutability, amendments; earnings, refund reversals; settlement idempotency, payout reference requirement, zero balance after payout; reschedule race (slot taken before approval) and atomic approval; no-show and doctor-absence sweeps; onboarding completeness and credential verification; overlapping availability rules; DST consistency of the SQL validator | **4/4 suites pass** |
| `npm run typecheck` | TypeScript strict | Clean |
| `npm run lint` | ESLint incl. React compiler rules | Clean |
| `npx next build` | Production build with Cache Components; all portal routes render per request | Passes |

PGlite stubs Supabase-managed schemas (auth, storage, realtime), so `db:check` validates **our** SQL, not Supabase internals. Re-run the SQL suites against a dev Supabase project before launch (see `04-deployment.md`).

Smoke-tested with `next start` and no Supabase configured: public pages return 200; protected pages stream a redirect to `/login`; API routes return 401.

## Manual tests (need a configured environment)

Run against a dev Supabase project with seed data (password `DevPassword123`).

**Authentication**
- [ ] Patient sign-up → verification email → callback → patient portal
- [ ] Booking as a guest: magic link → returns to `/book` → booking
- [ ] Doctor sign-up → onboarding; portal clinical pages blocked until approval
- [ ] Forgot/reset password; expired link shows a friendly message
- [ ] Patient visiting `/admin` is redirected to `/patient`; deactivated user is sent to `/account-disabled`

**Booking & payments** (Stripe test mode)
- [ ] Slots on Dr Mehta (Kolkata) shown correctly in a New York browser and a London browser; compare with a time-zone converter for dates either side of 1 Nov 2026
- [ ] Two browsers pick the same slot: second gets "just booked by someone else"
- [ ] Payment success → Confirmed only after webhook; a closed checkout tab leaves Pending until the hold expires (sweep)
- [ ] Failed card → booking stays pending; retry works
- [ ] Upgrade chat → video charges the difference
- [ ] Cancel at >24h / 4–24h / <4h gives 100% / 50% / 0% (default policy)
- [ ] Reschedule request → admin approves → both emails show the new time in each recipient's zone

**Consultations**
- [ ] Chat between two browsers; read ticks; reload preserves history; offline/online indicator
- [ ] Video: permission denial message; camera off/mute; leave and rejoin; patient reload reconnects
- [ ] Video across networks (mobile hotspot ↔ office Wi-Fi) with and without TURN
- [ ] A third account opening `/consult/<id>` gets 404; signalling channel join is refused

**Clinical**
- [ ] Upload report (progress bar), download (signed URL expires after 60 s), delete
- [ ] Doctor sees the record only after confirmation; unrelated doctor cannot
- [ ] Prescription draft → finalise → patient notified → print/PDF; amend → v2 supersedes v1
- [ ] Patient shares records with a second doctor, then revokes

**Finance**
- [ ] Completed consultation creates an earning (90% net at default commission)
- [ ] Settlement batch → payout approve → paid (reference required) → doctor sees it; CSV statement totals match

**UI / accessibility**
- [ ] 375 px, 768 px and desktop layouts for home, doctor profile, booking, portals, consultation room
- [ ] Keyboard-only navigation of the booking flow and consultation controls; visible focus
- [ ] Empty, loading (skeletons) and error states on each portal list
