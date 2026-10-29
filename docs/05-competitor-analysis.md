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
- [Practo app listing](https://apps.apple.com/us/app/-/id953772015)
- [Benefits Weekly: Coming in 2026, Teladoc Health Primary Care and Dermatology](https://benefitsweekly.cooperative.com/coming-in-2026-teladoc-health-primary-care-and-dermatology/)
- [Fierce Healthcare: Teladoc cautious 2026 outlook](https://www.fiercehealthcare.com/health-tech/teladoc-health-offers-cautious-2026-outlook-it-shifts-telehealth-model)
- [TreatCompare: Online GP consultation cost UK 2026](https://www.treatcompare.com/articles/online-gp-consultation-cost-uk)
- [TreatCompare: Push Doctor](https://www.treatcompare.com/private-gp/providers/push-doctor)
- [Doctor Care Anywhere: Private GP appointment cost](https://doctorcareanywhere.com/private-gp-appointment-cost-uk)
