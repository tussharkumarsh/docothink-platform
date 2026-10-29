/**
 * Patient FAQs, carried over from the legacy Docothink website. Answers were corrected where the
 * legacy copy described features that don't exist, or made compliance claims the platform cannot
 * make (e.g. "complies with GDPR and HIPAA"). Edit with care: these are customer-facing promises.
 */
export type Faq = { question: string; answer: string };

export const FAQ_GROUPS: { title: string; items: Faq[] }[] = [
  {
    title: "Getting started",
    items: [
      {
        question: "How does Docothink work?",
        answer:
          "Choose a verified doctor by specialty, pick a text chat, audio or video consultation, and book a time that suits you. Times are shown in your own time zone. Add your reason for the visit and any reports, pay securely, and join the consultation from your account at the booked time.",
      },
      {
        question: "Is an online consultation as effective as an in-person visit?",
        answer:
          "For many concerns, such as routine check-ups, follow-ups, second opinions and minor illnesses, an online consultation is convenient and effective. Some conditions need a physical examination or tests; if so, your doctor will tell you and advise on next steps.",
      },
      {
        question: "I don't know which specialty to choose.",
        answer:
          "If you're unsure, start with General Medicine. A general physician can assess your symptoms and recommend a specialist if you need one.",
      },
      {
        question: "How do I register?",
        answer:
          "You can create an account with your email address, or simply book your first appointment: we'll email you a secure link to verify your address and set up your account. We never send passwords by email.",
      },
    ],
  },
  {
    title: "Booking and consultations",
    items: [
      {
        question: "How do I book an appointment?",
        answer:
          "Open a doctor's profile, choose the consultation type, then pick an available time. You'll see each slot in your local time zone, with the zone clearly labelled. Confirm the details, pay, and you'll receive a confirmation email.",
      },
      {
        question: "Can I talk to the doctor by phone?",
        answer:
          "Choose an audio consultation. Calls run securely in your browser, so you don't need to share your phone number with the doctor.",
      },
      {
        question: "How do I chat with the doctor?",
        answer:
          "Choose a text chat consultation. At your appointment time, open the consultation from your account and message the doctor in real time.",
      },
      {
        question: "Will I be notified about my consultation?",
        answer:
          "Yes. You'll get an email when your booking is confirmed and reminders before it starts. Each email states the date, time and time zone.",
      },
      {
        question: "How do I share reports with my doctor?",
        answer:
          "Upload reports in your account under Medical reports, or attach them to a specific appointment. Only you, the doctors treating you, and anyone you explicitly share them with can see them.",
      },
      {
        question: "Can I book a follow-up with the same doctor?",
        answer: "Yes. Book again from the doctor's profile or from your past appointment.",
      },
      {
        question: "Can I reschedule?",
        answer:
          "You can request a different available time from your appointment page. Your original time stays reserved until the request is approved, and you'll be notified either way.",
      },
      {
        question: "What happens if there are technical problems during the consultation?",
        answer:
          "Contact support. If a genuine technical problem significantly affected your consultation, we'll arrange another session with the same doctor or a refund.",
      },
      {
        question: "What if I miss my appointment?",
        answer:
          "If you don't join, the appointment is marked as a no-show and isn't refunded. If the doctor doesn't join, the appointment is cancelled and you receive a full refund.",
      },
    ],
  },
  {
    title: "Prescriptions, privacy and payments",
    items: [
      {
        question: "Will I get a prescription?",
        answer:
          "If your doctor decides a prescription is clinically appropriate, they'll issue one in your account, where you can view and print it. Prescribing decisions are always made by the doctor; whether a prescription from an overseas doctor can be dispensed depends on your local regulations.",
      },
      {
        question: "Is my personal and medical information kept confidential?",
        answer:
          "Your records are stored in private, access-controlled storage, transmitted over encrypted connections, and visible only to you and the clinicians involved in your care. Access to sensitive records is logged. See our Privacy Policy for details.",
      },
      {
        question: "What payment methods do you accept?",
        answer: "Major credit and debit cards through our secure payment provider. Card details are never stored on Docothink.",
      },
      {
        question: "Can I cancel and get a refund?",
        answer:
          "Yes, according to the cancellation policy shown when you book: cancelling well in advance gives a full refund, closer to the time a partial refund, and very late cancellations aren't refunded. If a doctor cancels, you're refunded in full.",
      },
      {
        question: "Where can I see my invoices?",
        answer: "Sign in and open Payments to see every payment, its status and a printable receipt.",
      },
      {
        question: "Is this an emergency service?",
        answer:
          "No. If you have a medical emergency, call 911 (US), 999 (UK) or 112 (India), or go to your nearest emergency department immediately.",
      },
    ],
  },
];
