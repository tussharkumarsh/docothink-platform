import type { Metadata } from "next";
import { CalendarClock, FileCheck2, Globe2, Wallet } from "lucide-react";
import { ButtonLink, Card } from "@/components/ui";

export const metadata: Metadata = { title: "Join as a doctor" };

export default function ForDoctorsPage() {
  return (
    <div className="mx-auto max-w-5xl px-4 py-12 sm:px-6">
      <h1 className="text-3xl font-semibold tracking-tight text-slate-900">Consult patients worldwide</h1>
      <p className="mt-3 max-w-2xl text-lg text-slate-600">
        Set your own hours in your own time zone, choose your fees for chat, audio and video, and see patients from the
        US, UK and beyond.
      </p>
      <div className="mt-6 flex flex-wrap gap-3">
        <ButtonLink href="/signup/doctor" size="lg">Apply now</ButtonLink>
        <ButtonLink href="/login" size="lg" variant="secondary">I already applied</ButtonLink>
      </div>

      <div className="mt-12 grid gap-4 sm:grid-cols-2">
        {[
          { icon: Globe2, title: "Your time zone, their time zone", body: "Publish availability in your local time. Patients see it converted automatically, including daylight saving." },
          { icon: CalendarClock, title: "Flexible schedule", body: "Weekly hours, multiple windows per day, buffers, leave and holiday blocks." },
          { icon: Wallet, title: "Clear earnings", body: "See gross fees, the platform commission and your net earnings per consultation, plus every payout." },
          { icon: FileCheck2, title: "Clinical tools", body: "Patient history, uploaded reports, structured e-prescriptions and versioned clinical records." },
        ].map(({ icon: Icon, title, body }) => (
          <Card key={title} className="p-5">
            <Icon className="size-6 text-brand-600" aria-hidden />
            <p className="mt-3 font-medium text-slate-900">{title}</p>
            <p className="mt-1 text-sm text-slate-600">{body}</p>
          </Card>
        ))}
      </div>

      <h2 className="mt-12 text-xl font-semibold text-slate-900">How onboarding works</h2>
      <ol className="mt-4 space-y-3 text-sm text-slate-700">
        {[
          "Create your account and verify your email.",
          "Add your professional details, specialties and proposed fees.",
          "Upload your medical registration certificate, qualifications and an identity document (kept private).",
          "Accept the platform terms and submit your application.",
          "Our team reviews your documents. We may ask for more information.",
          "Once approved, set your availability and your profile goes live.",
        ].map((step, i) => (
          <li key={step} className="flex gap-3">
            <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-brand-100 text-xs font-semibold text-brand-700">{i + 1}</span>
            {step}
          </li>
        ))}
      </ol>
    </div>
  );
}
