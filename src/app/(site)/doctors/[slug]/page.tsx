import type { Metadata } from "next";
import Image from "next/image";
import { notFound } from "next/navigation";
import { cookies } from "next/headers";
import { Suspense } from "react";
import { BadgeCheck, GraduationCap, Languages, MapPin } from "lucide-react";
import { Badge, Card, CardHeader, Skeleton } from "@/components/ui";
import { getDoctorBySlug, getDoctorSlots, photoUrl } from "@/features/catalog/queries";
import { feesOf } from "@/features/catalog/components/doctor-card";
import { formatRating } from "@/features/catalog/discovery";
import { InitialsAvatar } from "@/components/ui/avatar";
import { getDoctorReviews, getRatingDistribution } from "@/features/reviews/queries";
import { RatingSummary, StarRow } from "@/features/reviews/components/rating-summary";
import { ReviewList } from "@/features/reviews/components/review-list";
import { SlotPicker } from "@/features/catalog/components/slot-picker";
import { isValidTimezone, supportedTimezones } from "@/lib/time/format";

export async function generateMetadata({ params }: PageProps<"/doctors/[slug]">): Promise<Metadata> {
  const doctor = await getDoctorBySlug((await params).slug);
  return { title: doctor ? `${doctor.title} ${doctor.display_name}` : "Doctor" };
}

async function Booking({ slug }: { slug: string }) {
  const doctor = await getDoctorBySlug(slug);
  if (!doctor) return null;
  const tzCookie = (await cookies()).get("tz")?.value;
  const slots = doctor.is_accepting_bookings ? await getDoctorSlots(doctor) : [];
  if (!doctor.is_accepting_bookings) {
    return <p className="p-5 text-sm text-slate-600">This doctor is not taking new bookings at the moment.</p>;
  }
  return (
    <div className="p-5">
      <SlotPicker
        doctorSlug={doctor.slug}
        doctorTimezone={doctor.timezone}
        currency={doctor.currency}
        fees={feesOf(doctor)}
        slots={slots}
        timezones={supportedTimezones()}
        initialTimezone={tzCookie && isValidTimezone(tzCookie) ? tzCookie : undefined}
      />
    </div>
  );
}

export default async function DoctorPage({ params }: PageProps<"/doctors/[slug]">) {
  const { slug } = await params;
  const doctor = await getDoctorBySlug(slug);
  if (!doctor) notFound();
  const [reviews, distribution] = doctor.rating_count > 0
    ? await Promise.all([getDoctorReviews(doctor.user_id), getRatingDistribution(doctor.user_id)])
    : [[], null];
  const rating = formatRating(doctor.rating_avg, doctor.rating_count);

  return (
    <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6">
      <div className="grid gap-8 lg:grid-cols-[1fr_26rem]">
        <div className="space-y-6">
          <Card className="p-6">
            <div className="flex flex-col gap-5 sm:flex-row">
              {doctor.photo_path ? (
                <Image src={photoUrl(doctor.photo_path)} alt="" width={112} height={112} className="size-28 rounded-full object-cover ring-1 ring-slate-200" />
              ) : (
                <InitialsAvatar name={doctor.display_name} size={112} />
              )}
              <div>
                <h1 className="text-2xl font-semibold text-slate-900">
                  {doctor.title} {doctor.display_name}
                </h1>
                <p className="text-brand-700">{doctor.headline}</p>
                {rating && (
                  <a href="#reviews" className="mt-1 inline-flex items-center gap-1.5 text-sm text-slate-700 hover:underline">
                    <StarRow rating={Number(doctor.rating_avg)} /> {rating}
                  </a>
                )}
                <p className="mt-1 text-sm text-slate-600">{doctor.qualifications}</p>
                <div className="mt-3 flex flex-wrap gap-2">
                  <Badge tone="success"><BadgeCheck className="size-3" aria-hidden /> Registration verified</Badge>
                  {doctor.specialties.map((s) => <Badge key={s.slug} tone="info">{s.name}</Badge>)}
                  {doctor.years_experience != null && <Badge>{doctor.years_experience} years experience</Badge>}
                  {doctor.is_demo && <Badge tone="warning">Demo profile</Badge>}
                </div>
                <dl className="mt-4 grid gap-2 text-sm text-slate-600 sm:grid-cols-2">
                  {doctor.languages.length > 0 && (
                    <div className="flex items-center gap-2"><Languages className="size-4 text-slate-400" aria-hidden /><dt className="sr-only">Languages</dt><dd>{doctor.languages.join(", ")}</dd></div>
                  )}
                  <div className="flex items-center gap-2"><MapPin className="size-4 text-slate-400" aria-hidden /><dt className="sr-only">Time zone</dt><dd>Works in {doctor.timezone}</dd></div>
                </dl>
              </div>
            </div>
          </Card>

          {doctor.bio && (
            <Card>
              <CardHeader title="About" />
              <p className="whitespace-pre-line p-5 text-sm leading-relaxed text-slate-700">{doctor.bio}</p>
            </Card>
          )}

          {doctor.education.length > 0 && (
            <Card>
              <CardHeader title="Education" />
              <ul className="divide-y divide-slate-100">
                {doctor.education.map((e, i) => (
                  <li key={i} className="flex gap-3 px-5 py-3 text-sm">
                    <GraduationCap className="mt-0.5 size-4 text-slate-400" aria-hidden />
                    <span><span className="font-medium text-slate-900">{e.degree}</span>, {e.institution}{e.year ? ` (${e.year})` : ""}</span>
                  </li>
                ))}
              </ul>
            </Card>
          )}

          {doctor.experience.length > 0 && (
            <Card>
              <CardHeader title="Experience" />
              <ul className="divide-y divide-slate-100">
                {doctor.experience.map((e, i) => (
                  <li key={i} className="px-5 py-3 text-sm">
                    <span className="font-medium text-slate-900">{e.position}</span>, {e.organization}{e.years ? ` · ${e.years}` : ""}
                  </li>
                ))}
              </ul>
            </Card>
          )}

          {distribution && doctor.rating_avg != null && (
            <Card id="reviews">
              <CardHeader title="Patient reviews" description="Only patients who completed a consultation with this doctor can leave a review." />
              <RatingSummary avg={Number(doctor.rating_avg)} distribution={distribution} />
              <ReviewList reviews={reviews} />
            </Card>
          )}

          <Card>
            <CardHeader title="Registration" description="Checked by Docothink before approval." />
            <dl className="grid gap-3 p-5 text-sm sm:grid-cols-3">
              <div><dt className="text-slate-500">Council</dt><dd className="text-slate-900">{doctor.registration_council ?? "—"}</dd></div>
              <div><dt className="text-slate-500">Number</dt><dd className="text-slate-900">{doctor.registration_number ?? "—"}</dd></div>
              <div><dt className="text-slate-500">Country</dt><dd className="text-slate-900">{doctor.registration_country ?? "—"}</dd></div>
            </dl>
          </Card>
        </div>

        <Card id="book" className="h-fit lg:sticky lg:top-24">
          <CardHeader title="Book a consultation" description="Prices are per consultation." />
          <Suspense fallback={<div className="space-y-3 p-5"><Skeleton className="h-16" /><Skeleton className="h-10" /><Skeleton className="h-40" /></div>}>
            <Booking slug={slug} />
          </Suspense>
        </Card>
      </div>
    </div>
  );
}
