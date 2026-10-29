import type { Metadata } from "next";
import { LegalReviewNotice, ProsePage } from "@/components/layout/prose-page";

export const metadata: Metadata = { title: "Medical disclaimer" };

export default function MedicalDisclaimerPage() {
  return (
    <ProsePage title="Medical disclaimer" updated="29 October 2026">
      <LegalReviewNotice />
      <h2>Not an emergency service</h2>
      <p>
        Docothink must not be used for medical emergencies. If you have chest pain, difficulty breathing, severe
        bleeding, signs of stroke, thoughts of harming yourself, or any other urgent problem, call 911 (US), 999 (UK),
        112 (India) or your local emergency number, or go to the nearest emergency department.
      </p>
      <h2>Limits of remote consultations</h2>
      <p>
        Online consultations cannot replace every physical examination or test. Your doctor may advise in-person
        assessment when a remote consultation is not appropriate.
      </p>
      <h2>Clinical responsibility</h2>
      <p>
        Doctors are independent registered practitioners responsible for their clinical advice, diagnoses and
        prescriptions. Docothink provides the technology platform and does not practise medicine. The platform does
        not generate diagnoses or prescriptions automatically.
      </p>
      <h2>Prescriptions across borders</h2>
      <p>
        Whether a prescription issued by a doctor registered in another country can be dispensed where you live depends
        on local law and pharmacy rules. Your doctor will explain any limitations.
      </p>
      <h2>Information on this website</h2>
      <p>Health information on this website is general and is not a substitute for advice about your individual circumstances.</p>
    </ProsePage>
  );
}
