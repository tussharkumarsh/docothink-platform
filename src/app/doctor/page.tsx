import Link from "next/link";
import { Video } from "lucide-react";
import { Alert, ButtonLink, Card, CardHeader, PageHeader, Stat } from "@/components/ui";
import { requireApprovedDoctor } from "@/lib/auth/viewer";
import { createClient } from "@/lib/supabase/server";
import { listAppointments } from "@/features/appointments/queries";
import { AppointmentTable } from "@/features/appointments/components/appointment-table";
import { getPlatformSettings, joinWindow } from "@/features/appointments/settings";
import { formatMoney } from "@/lib/money";
import { formatDateTime } from "@/lib/time/format";
import { formatRating } from "@/features/catalog/discovery";
import { ReviewList } from "@/features/reviews/components/review-list";
import { profileCompleteness } from "@/features/doctor/kyc";

export default async function DoctorDashboard() {
  const viewer = await requireApprovedDoctor();
  const supabase = await createClient();
  const [upcoming, settings, { data: ledger }, { count: rules }, { data: profile }, { data: recentReviews }, { data: privateDetails }] = await Promise.all([
    listAppointments({ scope: "upcoming", limit: 20 }),
    getPlatformSettings(),
    supabase.from("financial_ledger_entries").select("amount, currency, entry_type"),
    supabase.from("doctor_availability_rules").select("id", { count: "exact", head: true }).eq("is_active", true),
    supabase.from("doctor_profiles").select("rating_avg, rating_count, education, experience, services, special_interests").eq("user_id", viewer.id).single(),
    // The public view shows comments only once approved, which is also what the doctor should see.
    supabase.from("public_doctor_reviews").select("id, rating, comment, reviewer_name, created_at").eq("doctor_id", viewer.id)
      .order("created_at", { ascending: false }).limit(5),
    supabase.from("doctor_private_details").select("address_line1, city, postal_code, country, kyc_status").eq("doctor_id", viewer.id).maybeSingle(),
  ]);
  const completeness = profileCompleteness({
    education: (profile?.education as unknown[] | null)?.length ?? 0,
    experience: (profile?.experience as unknown[] | null)?.length ?? 0,
    services: profile?.services?.length ?? 0,
    specialInterests: profile?.special_interests?.length ?? 0,
    addressComplete: Boolean(privateDetails?.address_line1 && privateDetails.city && privateDetails.postal_code && privateDetails.country),
    kycStatus: privateDetails?.kyc_status ?? "not_submitted",
  });
  const balances = new Map<string, number>();
  for (const e of ledger ?? []) balances.set(e.currency, (balances.get(e.currency) ?? 0) + e.amount);
  const live = upcoming.filter((a) => (a.status === "confirmed" || a.status === "in_progress") && joinWindow(a.start_at, a.end_at, settings.consultation).open);
  const todayKey = new Intl.DateTimeFormat("en-CA", { timeZone: viewer.timezone }).format(new Date());
  const today = upcoming.filter((a) => new Intl.DateTimeFormat("en-CA", { timeZone: viewer.timezone }).format(new Date(a.start_at)) === todayKey);

  return (
    <>
      <PageHeader title="Dashboard" description={`All times in ${viewer.timezone}.`} />
      {!rules && <Alert tone="warning" className="mb-6">You have no availability yet, so patients can&apos;t book you. <Link href="/doctor/availability" className="underline">Add your hours</Link>.</Alert>}
      {live.map((a) => (
        <Alert key={a.id} tone="success" className="mb-4" title={`Consultation ${a.status === "in_progress" ? "in progress" : "ready to start"}: ${a.patient_name ?? "patient"}`}>
          {formatDateTime(a.start_at, viewer.timezone)}
          <div className="mt-2"><ButtonLink href={`/consult/${a.id}`} size="sm"><Video className="size-4" aria-hidden /> {a.status === "in_progress" ? "Rejoin" : "Start consultation"}</ButtonLink></div>
        </Alert>
      ))}
      {completeness.done < completeness.total && (
        <Card className="mb-6">
          <CardHeader
            title={`Profile ${completeness.done}/${completeness.total} complete`}
            description="A complete profile helps patients choose you, and verified bank details are needed for settlements."
          />
          <ul className="flex flex-wrap gap-2 px-5 pb-5">
            {completeness.missing.map((m) => (
              <li key={m.key}>
                <Link href={`/doctor/profile?tab=${m.tab}`} className="inline-flex rounded-full bg-amber-50 px-3 py-1 text-sm text-amber-900 hover:bg-amber-100">
                  Add {m.label.toLowerCase()} →
                </Link>
              </li>
            ))}
          </ul>
        </Card>
      )}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Today" value={today.length} hint="appointments" />
        <Stat label="Upcoming" value={upcoming.length} />
        <Stat label="Unpaid balance" value={balances.size ? [...balances].map(([c, v]) => formatMoney(v, c)).join(" · ") : formatMoney(0, "INR")} hint={<Link href="/doctor/earnings" className="text-brand-700 hover:underline">Earnings</Link>} />
        <Stat label="Your rating" value={formatRating(profile?.rating_avg ?? null, profile?.rating_count ?? 0) ?? "No ratings yet"} hint="from verified patients" />
      </div>
      <Card className="mt-6">
        <CardHeader title="Upcoming appointments" action={<Link href="/doctor/appointments" className="text-sm text-brand-700 hover:underline">All appointments</Link>} />
        <AppointmentTable rows={upcoming} perspective="doctor" timezone={viewer.timezone} hrefBase="/doctor/appointments" />
      </Card>
      {(recentReviews?.length ?? 0) > 0 && (
        <Card className="mt-6">
          <CardHeader title="Recent reviews" description="Written comments appear here once they've been approved." />
          <ReviewList reviews={recentReviews!} timezone={viewer.timezone} />
        </Card>
      )}
    </>
  );
}
