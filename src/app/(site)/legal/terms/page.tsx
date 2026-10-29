import type { Metadata } from "next";
import { LegalReviewNotice, ProsePage } from "@/components/layout/prose-page";

export const metadata: Metadata = { title: "Terms and conditions" };

export default function TermsPage() {
  return (
    <ProsePage title="Terms and conditions" updated="29 October 2026">
      <LegalReviewNotice />
      <h2>The service</h2>
      <p>Docothink is a platform that lets patients book consultations with independent, registered doctors. Docothink does not itself provide medical care.</p>
      <h2>Eligibility and accounts</h2>
      <p>You must be 18 or older to create an account. A parent or guardian must book for, and be present during, a child&apos;s consultation. Keep your sign-in details secure.</p>
      <h2>Bookings and payment</h2>
      <p>Prices are set by each doctor and shown before you pay. A slot is reserved for a short time while payment completes; a booking is confirmed only once the payment provider confirms payment.</p>
      <h2>Cancellations, rescheduling and refunds</h2>
      <p>Cancellations are refunded according to the policy shown on the Pricing page at the time of booking. Reschedule requests are subject to availability and approval. If a doctor cancels or does not attend, you receive a full refund.</p>
      <h2>Acceptable use</h2>
      <p>Do not misuse the service, impersonate others, or attempt to access records that are not yours. Be respectful to doctors and staff.</p>
      <h2>Doctors</h2>
      <p>Doctors must hold valid registration, keep their details accurate, practise within their scope and applicable law, and comply with the separate doctor agreement, including the platform commission.</p>
      <h2>Liability</h2>
      <p>[Limitation of liability, governing law and dispute resolution to be drafted by counsel for each market.]</p>
    </ProsePage>
  );
}
