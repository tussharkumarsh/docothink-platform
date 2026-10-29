import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { Alert, ButtonLink, Card, CardHeader, Skeleton } from "@/components/ui";
import { getDoctorBySlug, getDoctorSlots } from "@/features/catalog/queries";
import { BookingForm } from "@/features/booking/components/booking-form";
import { MagicLinkForm } from "@/features/auth/components/auth-forms";
import { getViewer } from "@/lib/auth/viewer";
import { CONSULTATION_MODES, MODE_LABELS, type ConsultationMode } from "@/lib/domain";
import { formatMoney } from "@/lib/money";
import { formatDateTime, isValidTimezone, supportedTimezones } from "@/lib/time/format";
import { paymentsConfigured, testPaymentsEnabled } from "@/lib/payments";

export const metadata: Metadata = { title: "Confirm your booking" };

async function Booking({ searchParams }: { searchParams: PageProps<"/book">["searchParams"] }) {
  const p = await searchParams;
  const slug = typeof p.doctor === "string" ? p.doctor : "";
  const start = typeof p.start === "string" ? p.start : "";
  const mode = (typeof p.mode === "string" ? p.mode : "") as ConsultationMode;
  const tzParam = typeof p.tz === "string" && isValidTimezone(p.tz) ? p.tz : undefined;

  const doctor = slug ? await getDoctorBySlug(slug) : null;
  if (!doctor || !CONSULTATION_MODES.includes(mode) || Number.isNaN(Date.parse(start))) {
    return <Alert tone="warning" title="This booking link is incomplete">Please choose a doctor and time again. <Link href="/doctors" className="underline">Find a doctor</Link></Alert>;
  }
  const fee = doctor[`fee_${mode}`];
  // Re-check against live availability before showing the form; the database checks again on submit.
  const slots = await getDoctorSlots(doctor, mode);
  const stillOpen = slots.some((s) => Date.parse(s.start) === Date.parse(start));

  const viewer = await getViewer();
  const tz = viewer?.timezone && viewer.timezone !== "UTC" ? viewer.timezone : (tzParam ?? "UTC");
  const here = `/book?doctor=${encodeURIComponent(slug)}&mode=${mode}&start=${encodeURIComponent(start)}${tzParam ? `&tz=${encodeURIComponent(tzParam)}` : ""}`;

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_22rem]">
      <Card>
        <CardHeader title="Your details" description="Step 2 of 3: tell the doctor why you're booking." />
        <div className="p-5">
          {!stillOpen ? (
            <Alert tone="warning" title="That time is no longer available">
              Someone else may have just booked it. <Link href={`/doctors/${slug}#book`} className="underline">Choose another time</Link>.
            </Alert>
          ) : fee == null ? (
            <Alert tone="warning">This doctor doesn&apos;t offer {MODE_LABELS[mode].toLowerCase()} consultations.</Alert>
          ) : !viewer ? (
            <div className="space-y-4">
              <p className="text-sm text-slate-600">
                Enter your email to continue. We&apos;ll send a secure link that creates your patient account (your email is your
                username) and brings you back here. No password is emailed.
              </p>
              <MagicLinkForm next={here} cta="Continue with email" />
              <p className="text-sm text-slate-600">
                Already have an account? <Link href={`/login?next=${encodeURIComponent(here)}`} className="font-medium text-brand-700 hover:underline">Log in</Link>
              </p>
            </div>
          ) : viewer.role !== "patient" ? (
            <Alert tone="info">You&apos;re signed in as a {viewer.role}. Please use a patient account to book consultations.</Alert>
          ) : (
            <>
              {testPaymentsEnabled() ? (
                <Alert tone="info" className="mb-4" title="Test payment mode">
                  The fee of {formatMoney(fee, doctor.currency)} is recorded as paid as soon as you confirm. No card is needed.
                </Alert>
              ) : !paymentsConfigured() && (
                <Alert tone="warning" className="mb-4" title="Online payment is not configured">
                  You can reserve the slot, but it will expire unless payment is completed.
                </Alert>
              )}
              <BookingForm
                doctorId={doctor.user_id}
                start={start}
                mode={mode}
                timezone={tz}
                timezones={supportedTimezones()}
                paymentMode={paymentsConfigured() ? "provider" : testPaymentsEnabled() ? "test" : "none"}
              />
            </>
          )}
        </div>
      </Card>

      <Card className="h-fit">
        <CardHeader title="Booking summary" />
        <dl className="space-y-3 p-5 text-sm">
          <div><dt className="text-slate-500">Doctor</dt><dd className="font-medium text-slate-900">{doctor.title} {doctor.display_name}</dd></div>
          <div><dt className="text-slate-500">Consultation</dt><dd className="text-slate-900">{MODE_LABELS[mode]}</dd></div>
          <div>
            <dt className="text-slate-500">Your time</dt>
            <dd className="font-medium text-slate-900">{formatDateTime(start, tz)}</dd>
          </div>
          <div><dt className="text-slate-500">Doctor&apos;s local time</dt><dd className="text-slate-700">{formatDateTime(start, doctor.timezone)}</dd></div>
          {fee != null && <div className="border-t border-slate-100 pt-3"><dt className="text-slate-500">Fee</dt><dd className="text-lg font-semibold text-slate-900">{formatMoney(fee, doctor.currency)}</dd></div>}
        </dl>
        <div className="px-5 pb-5"><ButtonLink href={`/doctors/${slug}#book`} variant="ghost" size="sm">Change time</ButtonLink></div>
      </Card>
    </div>
  );
}

export default function BookPage({ searchParams }: PageProps<"/book">) {
  return (
    <div className="mx-auto max-w-5xl px-4 py-10 sm:px-6">
      <h1 className="mb-6 text-2xl font-semibold text-slate-900">Confirm your booking</h1>
      <Suspense fallback={<Skeleton className="h-96" />}>
        <Booking searchParams={searchParams} />
      </Suspense>
    </div>
  );
}
