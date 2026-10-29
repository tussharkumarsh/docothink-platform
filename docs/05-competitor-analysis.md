# 05 — Competitor Analysis

Researched 2026-10-29 from public sources only. No proprietary code, branding or designs were copied. Figures marked *(self-reported)* come from the company itself; price-comparison sites may be affiliated with the providers they list.

## Comparison

| | Zocdoc (US) | Teladoc Health (US) | Doctor On Demand / Included Health (US) | Practo (India) | Livi / Push Doctor (UK) | **Docothink (this build)** |
|---|---|---|---|---|---|---|
| Model | Marketplace booking for in-person and video visits | Mostly employer- and plan-sponsored virtual care | Rebranded into Included Health in Oct 2021; aimed at employer health plans | Marketplace plus instant consults | Private GP by video | Marketplace of verified doctors, cross-border |
| Discovery | 200+ specialties, real-time 24/7 booking, filter for doctors offering video *(self-reported)* | Navigation and self-assessment to route people to care | AI assistant and provider matching (2025) | 25+ specialties, connect in about 2 minutes | GP-first | Specialty, consultation type, language, country, fee and "available within N days" filters |
| Consultation modes | In-person / video (video icon) | Phone / video | Video | Chat, audio, video (video in app only) | Video (some async) | Chat, audio, video in the browser, no app or phone number needed |
| Trust signals | Verified reviews after completed visits; providers verified before listing | Board-certified clinicians | Same clinicians, new brand | Doctor profiles | GMC-registered GPs | Registration number and council shown publicly; credentials verified by admins; "Verified" badge |
| Pricing transparency | Insurance-led; users told to confirm coverage with their insurer | Plan-dependent | Plan-dependent | Shown upfront (private audio from ₹199) | Fixed prices (Livi about £29, Push Doctor from £49) | Exact per-doctor, per-mode fee before booking; cancellation policy published |
| Continuity | Rebook with the same provider | Dedicated primary care provider; appointments within 5 days | — | Free follow-up (3 or 7 days; Practo's own page is inconsistent) | Prescriptions, referrals | Longitudinal history; rebook the same doctor; patient-controlled record sharing |
| Time zones | Single-country | Single-country | Single-country | Single-country | Single-country | **Cross-border by design**: slots converted per date (DST-aware), both zones on every screen and email |

## What we took from this

1. **Real-time slot booking with a hold**, like Zocdoc. Implemented: the slot is held for 15 minutes during payment, with the database preventing double booking.
2. **Video/mode visible on the card and filterable**, like Zocdoc's video icon and filter. Implemented: mode chips and a mode filter.
3. **Upfront, exact prices** (Practo, UK private GPs). Implemented, plus a published cancellation policy driven by the live settings.
4. **Visible verification.** Implemented: registration details on the public profile and admin credential review before approval.
5. **Continuity of care** (Teladoc's dedicated provider). Implemented: consultation history, prescriptions, rebooking, sharing with a second doctor.
6. **Prescriptions delivered in the account** (Practo). Implemented: structured e-prescriptions, printable, versioned.

## Deep dive: iCliniq and Practo (2026-10-29)

Both are the closest models for Docothink: online-first, multi-specialty, India-rooted, selling to patients directly. They solve the same problem in two different ways.

- **iCliniq** sells *answers*. The entry point is a cheap or free written question, answered asynchronously by a specialist, and then upsold to chat, phone or video. Its marketing is built around content (articles, public Q&A) and global reach.
- **Practo** sells *speed*. The entry point is a symptom tile ("Cold, cough or fever?") with a fixed price. The patient is matched to whichever verified doctor is online, and a free follow-up is included.

### Landing page: section order

| # | iCliniq | Practo (home + /consult) | Docothink today |
|---|---|---|---|
| 1 | Search bar ("Search for a disease") + "Free Consultation" button in the header | Four service tiles, each with a promise: "Instant Video Consultation · Connect within 60 secs" | Hero headline + "Book a consultation" |
| 2 | Hero is a trust claim: "Over 100 million people from 190+ countries trust iCliniq" + Trustpilot | "Consult top doctors online for any health concern" + 6 **symptom cards**, each with "CONSULT NOW" | Consultation types (chat/audio/video) |
| 3 | 18 specialty tiles; each leads to "Ask a {specialist}" | /consult: hero "Skip the travel!", "Starts at just ₹199", **3 steps**: speciality/symptom → audio/video with a verified doctor → digital prescription **& a free follow-up** | Specialty tiles + "Common concerns" chips (no prices) |
| 4 | Consultation types with prices and a "first query free" offer | Specialty and symptom grids **with a price on every tile** (₹600–₹799) | Featured doctors |
| 5 | Stats band: "4500+ doctors", **4.6 average rating**, **under 1 hour average turnaround** | Counts: 20,000+ doctors, 25+ specialities, 2,00,000+ users, 4.5/5 app rating | 4-step "how it works" |
| 6 | "As featured on" press logos | Doctor showcase with **consult counts** per doctor | FAQ preview |
| 7 | FAQ: safety (HIPAA/GDPR), verification, prescriptions, ~20-minute consults, "don't share your phone number" | FAQ incl. **"What happens if I don't get a response from a doctor?"** | Doctor recruitment panel |
| 8 | Doctor recruitment ("Join for free") + closing CTA "Ask a doctor online" | Testimonials (named patients, situation, outcome) | — |
| 9 | Footer with compliance badges and accepted payment cards | App download + "₹200 HealthCash" offer | — |

What both do that we don't:
1. **Lead with the patient's problem, not the product.** Practo's first decision is "what's bothering you?"; iCliniq's first decision is "ask your question".
2. **Show the price at the point of decision.** Every symptom/specialty tile carries a price.
3. **Make a time promise.** "Connect within 60 secs" (Practo), "15–30 minute response" / "under 1 hour turnaround" (iCliniq).
4. **Lower the first-time risk.** First query free (iCliniq), free follow-up (Practo), promo credit for the app.
5. **Show social proof.** Ratings, consult counts, patient stories, press logos.

### Patient journey

| Step | iCliniq | Practo | Docothink today |
|---|---|---|---|
| Entry | Type a question or pick "Ask a {specialist}" | Tap a symptom or specialty tile | Pick a doctor, then a time |
| Doctor choice | Optional; most queries go to the specialty panel | **Auto-matched** to an online doctor in the chosen specialty | Patient chooses a specific doctor |
| Timing | Async (query/chat), or scheduled phone/video with fast-track tiers (2h/4h) | Instant (now), or book a clinic visit | Scheduled slots only |
| Payment | Per query/plan; fast-track costs more | Fixed price per specialty; subscription (Practo Plus) | Doctor-set fee per mode |
| After | Digitally signed prescription; follow-up questions | Digital prescription + **free follow-up** (7 days on the consult page; 3 days on a partner page) | Prescription, rebooking, record sharing |
| Safety net | "Don't share phone/address" guidance | Reassignment when a doctor doesn't respond | No-show handling + refunds (admin) |

### Doctor side

- **iCliniq:** free sign-up in three steps (apply → verified by the team → consult anywhere). Flexible formats: async query/chat or live phone/video, **no fixed hours**. Paid per consultation or query, to a bank or PayPal account.
- **Practo:** verified profile with **patient stories, recommendation %, experience and fee** visible in search. Ranking and sorting depend on stories and experience. Instant consults need the doctor to be **online**.
- **Docothink today:** application with documents → admin approval → weekly availability → scheduled consults, earnings ledger and payouts. No "online now" state, no async inbox, no reputation signals.

### Admin side (inferred from the public product; admin tools aren't public)

Running these features implies admin tools Docothink doesn't have yet:
- **Review moderation**, and a public recommendation % per doctor.
- **Response-time monitoring.** iCliniq publishes average turnaround; Practo reassigns unanswered consults. Both need a live queue with SLA timers and escalation.
- **Platform pricing per specialty or symptom** (Practo), alongside or instead of doctor-set fees.
- **Promotions:** free first query, promo codes, wallet credit.
- **Content:** articles and public Q&A with medical review (iCliniq lists a Medical Review Team and editorial policy).
- **Follow-up policy:** a configurable free follow-up window.

### Search and filter (Practo listing page)

Filters: gender, patient-story count, experience (5+/10+/15+/20+ years), **availability (next 4 hours / today / tomorrow / next 7 days)**, video consult, fee bands, associated hospital. Sort: relevance, stories, experience, fee low→high / high→low. Cards show experience, fee, **recommendation %**, **patient-story count**, and a verified badge.

Docothink has specialty, mode, language, country, fee and "available within N days", but **no sorting, no gender, no experience filter and no reputation signals**.

### Gaps and plan

The guiding rule: copy the *approach*, not the claims. Docothink is new, so every number on the site must come from live data (doctors, specialties, countries, completed consults). No invented ratings, testimonials or press logos.

**Phase 1: landing page and discovery (no schema changes, low effort)**
1. "What's bothering you?" symptom cards at the top of the home page, each with "from ₹X/£X/$X" (computed from approved doctors' fees) and a Consult now button.
2. A live stats band: verified doctors, specialties, countries and languages covered, consultations completed. Each item appears only once its count is meaningful.
3. A three-step "how it works" with a clear promise: verified doctor → consult in your time zone → digital prescription.
4. Find a Doctor: sorting (earliest available, experience, fee ↑/↓), an experience filter, "Available today / tomorrow" shortcuts, and the next available slot on every card.
5. FAQ additions: "What if the doctor doesn't join?", "Can I share reports?", "Is my data private?", "Will I get a prescription?".

**Phase 2: trust and continuity (schema changes, medium effort)**
1. **Verified reviews** after a completed consultation only: patient rating + comment, admin moderation queue, recommendation % and consult count on cards and profiles.
2. **Free follow-up window** (admin setting, e.g. 7 days by chat with the same doctor) with a "Free follow-up available until …" banner for the patient.
3. **Doctor no-show guarantee**, shown publicly: if the doctor doesn't join within the grace period, an automatic full refund or free rebooking. The database already has no-show handling; this makes it a promise.
4. **Gender and experience** on doctor profiles (optional, doctor-provided) for filtering.

**Phase 3: new consultation models (new subsystems, higher effort)**
1. **"Ask a doctor" async question** (iCliniq model): the patient writes a question and attaches reports, pays a lower fixed price, and the question goes to a specialty queue. Doctors claim and answer within an SLA, with N follow-up messages included. Admin gets a queue with SLA timers and reassignment, and an option for the first question free.
2. **Instant consult** (Practo model): doctors toggle "Online now". The patient picks a specialty, pays the specialty price, and is matched to the first available online doctor, with a timeout leading to reassignment or refund.
3. **Promotions:** promo codes and first-consultation discounts, managed by admin.
4. **Public Q&A / health library** (opt-in, anonymised, medically reviewed) for search traffic.

## Recommendations for later

| Recommendation | Why | Effort |
|---|---|---|
| Verified post-consultation reviews (only after a completed appointment, like Zocdoc) | Strongest trust signal in marketplace booking | Medium: new table, moderation queue |
| Free follow-up window (configurable, e.g. 7 days via chat) | Practo's key differentiator; reduces anxiety about one-off consults | Medium: pricing rule plus a follow-up appointment type |
| "Not sure which specialist?" triage that routes to General Medicine, with no automated diagnosis | Mirrors Teladoc's self-assessment while staying within the no-AI-diagnosis rule | Low |
| Insurance/HSA receipt fields (US) | US patients often claim reimbursement | Low |
| Native mobile wrappers (PWA first) | Practo restricts video to its app; a PWA keeps it browser-based | Medium |

## Sources

- [Healthcare Dive: Doctor On Demand and Grand Rounds rebrand as Included Health](https://www.healthcaredive.com/news/doctor-on-demand-grand-rounds-rebrand-included-health-telehealth-virtual-care/608295/)
- [Business Wire: Grand Rounds Health and Doctor On Demand rebrand as Included Health (Oct 2021)](https://www.businesswire.com/news/home/20211018005309/en/Grand-Rounds-Health-and-Doctor-On-Demand-Rebrand-as-Included-Health)
- [Doctor On Demand: About us](https://doctorondemand.com/about-us/)
- [Zocdoc: structured company information](https://www.zocdoc.com/about/ai-llm-info/)
- [Capterra: Zocdoc 2026](https://www.capterra.com/p/10032407/Zocdoc/)
- [Practo: Consult](https://www.practo.com/consult/amp)
- [Practo: home page](https://www.practo.com/)
- [Practo: online consultation page](https://www.practo.com/consult)
- [Practo: dermatologist listing, Bangalore (filters and cards)](https://www.practo.com/bangalore/dermatologist)
- [Tata AIA: FAQs on Practo (3-day follow-up)](https://www.tataaia.com/faqs-on-practo.html)
- [iCliniq: home page](https://www.icliniq.com/)
- [iCliniq: Ask a doctor online](https://www.icliniq.com/ask-a-doctor-online)
- [iCliniq: Are you a doctor?](https://www.icliniq.com/are-you-a-doctor)
- [Practo app listing](https://apps.apple.com/us/app/-/id953772015)
- [Benefits Weekly: Coming in 2026, Teladoc Health Primary Care and Dermatology](https://benefitsweekly.cooperative.com/coming-in-2026-teladoc-health-primary-care-and-dermatology/)
- [Fierce Healthcare: Teladoc cautious 2026 outlook](https://www.fiercehealthcare.com/health-tech/teladoc-health-offers-cautious-2026-outlook-it-shifts-telehealth-model)
- [TreatCompare: Online GP consultation cost UK 2026](https://www.treatcompare.com/articles/online-gp-consultation-cost-uk)
- [TreatCompare: Push Doctor](https://www.treatcompare.com/private-gp/providers/push-doctor)
- [Doctor Care Anywhere: Private GP appointment cost](https://doctorcareanywhere.com/private-gp-appointment-cost-uk)
