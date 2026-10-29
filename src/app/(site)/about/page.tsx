import type { Metadata } from "next";
import { ProsePage } from "@/components/layout/prose-page";

export const metadata: Metadata = { title: "About us" };

export default function AboutPage() {
  return (
    <ProsePage title="About Docothink" lead="Quality medical advice shouldn't depend on where you live or what time zone you're in.">
      <p>
        Docothink connects patients in the United States, the United Kingdom and beyond with experienced, registered
        doctors, many of them based in India, for consultations by text chat, audio or video.
      </p>
      <h2>What we stand for</h2>
      <ul>
        <li><strong>Verified doctors.</strong> We check every doctor&apos;s medical registration, qualifications and identity before they can consult.</li>
        <li><strong>Clarity.</strong> Prices are shown upfront, and every appointment time is shown in your own time zone.</li>
        <li><strong>Privacy.</strong> Your medical records are private by default and shared only with the doctors treating you or people you choose.</li>
        <li><strong>Continuity.</strong> Your consultations, prescriptions and reports build into one history you can bring to future appointments.</li>
      </ul>
      <h2>Clinical responsibility</h2>
      <p>
        Doctors on Docothink are independent practitioners who are responsible for their own clinical decisions.
        Docothink does not diagnose or prescribe, and our software never generates diagnoses or prescriptions.
      </p>
    </ProsePage>
  );
}
