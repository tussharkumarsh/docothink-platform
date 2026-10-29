import type { Metadata } from "next";
import { ButtonLink } from "@/components/ui";
import { ProsePage } from "@/components/layout/prose-page";

export const metadata: Metadata = { title: "How it works" };

export default function HowItWorksPage() {
  return (
    <ProsePage title="How online consultation works" lead="From choosing a doctor to receiving your prescription, everything happens in one secure account.">
      <h2>1. Find the right doctor</h2>
      <p>Browse verified doctors by specialty, language, consultation type, fee and availability. Each profile shows qualifications, registration details and prices for chat, audio and video.</p>
      <h2>2. Book a time in your time zone</h2>
      <p>Doctors publish their working hours in their own time zone; you see every slot converted to yours for that exact date, so daylight-saving changes in the US, UK or India never cause confusion. Your confirmation email states the time and the zone.</p>
      <h2>3. Tell the doctor about your health</h2>
      <p>Share your reason for the visit and complete your medical profile: conditions, medicines, allergies, past surgeries and family history. You can save it and come back later. Upload reports securely; only the doctors treating you can see them.</p>
      <h2>4. Pay securely</h2>
      <p>Your slot is held for a short time while you pay. Payments are confirmed directly by the payment provider before your booking is confirmed.</p>
      <h2>5. Consult</h2>
      <p>Join from your account shortly before the start time. Chat, audio and video run directly in your browser. No app or phone number needed. Calls are not recorded.</p>
      <h2>6. Prescription and follow-up</h2>
      <p>If appropriate, your doctor issues a digital prescription and notes, which stay in your medical history. Need to change your time? Request a reschedule; your original slot stays reserved until it&apos;s approved.</p>
      <div className="pt-4"><ButtonLink href="/doctors" size="lg">Find a doctor</ButtonLink></div>
    </ProsePage>
  );
}
