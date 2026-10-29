import type { Metadata } from "next";
import { LegalReviewNotice, ProsePage } from "@/components/layout/prose-page";

export const metadata: Metadata = { title: "Privacy policy" };

export default function PrivacyPage() {
  return (
    <ProsePage title="Privacy policy" updated="29 October 2026">
      <LegalReviewNotice />
      <h2>What we collect</h2>
      <ul>
        <li>Account data: name, email, phone, country, time zone and language.</li>
        <li>Health data you provide: medical profile, reasons for visits, uploaded reports, consultation messages.</li>
        <li>Clinical records created by your doctors: consultation notes and prescriptions.</li>
        <li>Payment records (amounts, status, provider references). Card details are handled by our payment provider and never stored by us.</li>
        <li>Technical data needed for security, such as sign-in events and access logs.</li>
      </ul>
      <h2>How we use it</h2>
      <p>To provide consultations, maintain your medical history, process payments and refunds, send service notifications, keep the service secure, and meet legal obligations. We do not sell personal data or use health data for advertising.</p>
      <h2>Who can see your health information</h2>
      <ul>
        <li>You.</li>
        <li>Doctors you book with (from confirmation of the booking) and doctors you explicitly share your records with.</li>
        <li>A small number of authorised staff with a specific clinical-access permission, for support or safety reasons; such access is logged.</li>
      </ul>
      <h2>Security</h2>
      <p>Data is encrypted in transit; medical documents are kept in private storage and opened only through short-lived links after an access check. Audio and video consultations are peer-to-peer and are not recorded.</p>
      <h2>Retention</h2>
      <p>Clinical records are retained for the period required by medical record-keeping rules in the relevant jurisdiction, after which they are deleted or anonymised. [Retention periods to be confirmed by counsel.]</p>
      <h2>Your rights</h2>
      <p>Depending on where you live (for example under UK GDPR or US state law) you may have rights to access, correct, export or delete your data, and to object to certain processing. Contact support to exercise them.</p>
      <h2>International transfers</h2>
      <p>Your data may be processed in countries other than your own, including where your doctor is located. [Transfer safeguards to be confirmed by counsel.]</p>
    </ProsePage>
  );
}
