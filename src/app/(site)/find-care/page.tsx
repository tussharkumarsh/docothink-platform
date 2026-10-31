import type { Metadata } from "next";
import Link from "next/link";
import { cookies } from "next/headers";
import { Suspense } from "react";
import { Compass } from "lucide-react";
import { Alert, Button, ButtonLink, Card, CardHeader, Skeleton } from "@/components/ui";
import { getConditions, getDoctorBySlug, getDoctorSlots, getSpecialties, searchDoctors } from "@/features/catalog/queries";
import { DoctorCard } from "@/features/catalog/components/doctor-card";
import { TimezoneCookie } from "@/features/catalog/components/timezone-cookie";
import { nextAvailableDay, sortDoctors } from "@/features/catalog/discovery";
import { SAFETY_NOTE, suggestSpecialty } from "@/features/catalog/find-care";
import { formatDateTime, formatTime, isValidTimezone } from "@/lib/time/format";
import { nowMs } from "@/lib/time/now";

export const metadata: Metadata = {
  title: "Which doctor do I need?",
  description: "Pick what's bothering you and see which specialist to consult, with the doctors available soonest.",
};

const list = (v: string | string[] | undefined) => (Array.isArray(v) ? v : v ? v.split(",") : []).map((s) => s.trim()).filter(Boolean).slice(0, 10);

async function Guide({ searchParams }: { searchParams: PageProps<"/find-care">["searchParams"] }) {
  const sp = await searchParams;
  const chosen = list(sp.concerns);
  const forChild = sp.for === "child";
  const [conditions, specialties] = await Promise.all([getConditions(), getSpecialties()]);
  const bySlug = new Map(specialties.map((s) => [s.slug, s]));

  // Concerns grouped by specialty, in the specialties' display order.
  const groups = specialties
    .map((s) => ({ specialty: s, concerns: conditions.filter((c) => c.specialty_slug === s.slug) }))
    .filter((g) => g.concerns.length > 0);

  const selected = conditions.filter((c) => chosen.includes(c.slug));
  const suggestion = selected.length ? suggestSpecialty(selected, forChild) : null;

  return (
    <div className="space-y-8">
      <Card>
        <CardHeader title="What's bothering you?" description="Choose one or more. You can change your answers at any time." />
        <form className="space-y-6 p-5" action="/find-care">
          <fieldset>
            <legend className="mb-2 text-sm font-medium text-slate-900">Who is it for?</legend>
            <div className="flex gap-2">
              {(["adult", "child"] as const).map((who) => (
                <label key={who} className="cursor-pointer rounded-full bg-slate-100 px-4 py-1.5 text-sm text-slate-700 has-checked:bg-slate-900 has-checked:text-white">
                  <input type="radio" name="for" value={who} defaultChecked={(who === "child") === forChild} className="sr-only" />
                  {who === "adult" ? "Me or another adult" : "A child (under 16)"}
                </label>
              ))}
            </div>
          </fieldset>
          {groups.map((g) => (
            <fieldset key={g.specialty.slug}>
              <legend className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">{g.specialty.name}</legend>
              <div className="flex flex-wrap gap-2">
                {g.concerns.map((c) => (
                  <label key={c.slug} className="cursor-pointer rounded-full bg-slate-100 px-3.5 py-1.5 text-sm text-slate-700 transition-colors hover:bg-slate-200/70 has-checked:bg-brand-600 has-checked:text-white">
                    <input type="checkbox" name="concerns" value={c.slug} defaultChecked={chosen.includes(c.slug)} className="sr-only" />
                    {c.name}
                  </label>
                ))}
              </div>
            </fieldset>
          ))}
          <Button type="submit">Show me the right doctor</Button>
        </form>
      </Card>

      {chosen.length > 0 && !suggestion && (
        <Alert tone="info">We couldn&apos;t match those concerns to a specialty. <Link href="/doctors?specialty=general-medicine" className="underline">Start with General Medicine</Link>: a general physician can refer you on.</Alert>
      )}
      {suggestion && <Suggestion slug={suggestion} name={bySlug.get(suggestion)?.name ?? suggestion} description={bySlug.get(suggestion)?.description ?? null} />}
    </div>
  );
}

async function Suggestion({ slug, name, description }: { slug: string; name: string; description: string | null }) {
  const tzCookie = (await cookies()).get("tz")?.value;
  const tz = tzCookie && isValidTimezone(tzCookie) ? tzCookie : "UTC";
  const now = nowMs();
  const doctors = await searchDoctors({ specialty: slug });
  const withSlots = await Promise.all(
    doctors.slice(0, 20).map(async (doctor) => {
      const detail = await getDoctorBySlug(doctor.slug);
      const slots = detail ? await getDoctorSlots(detail) : [];
      return { doctor, next: slots[0]?.start ?? null };
    }),
  );
  const soonest = sortDoctors(withSlots, "available").slice(0, 3);
  const label = (next: string | null) => {
    if (!next) return null;
    const day = nextAvailableDay(next, tz, now);
    return day ? `${day === "today" ? "Today" : "Tomorrow"}, ${formatTime(next, tz)}` : formatDateTime(next, tz, { withZone: false });
  };

  return (
    <section aria-labelledby="suggestion" className="space-y-4">
      <TimezoneCookie current={tzCookie} />
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-sm font-medium text-brand-700">Suggested specialty</p>
          <h2 id="suggestion" className="text-2xl font-semibold text-slate-900">{name}</h2>
          {description && <p className="mt-1 max-w-2xl text-slate-500">{description}</p>}
        </div>
        <ButtonLink href={`/doctors?specialty=${slug}&sort=available`} variant="secondary">See all {name} doctors</ButtonLink>
      </div>
      {soonest.length === 0 ? (
        <Alert tone="info">No {name} doctors are taking bookings right now. <Link href="/doctors?specialty=general-medicine&sort=available" className="underline">See General Medicine</Link>.</Alert>
      ) : (
        <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
          {soonest.map(({ doctor, next }) => <DoctorCard key={doctor.user_id} doctor={doctor} nextAvailable={label(next)} />)}
        </div>
      )}
    </section>
  );
}

export default function FindCarePage({ searchParams }: PageProps<"/find-care">) {
  return (
    <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6">
      <div className="mb-8 flex items-start gap-4">
        <span className="flex size-12 shrink-0 items-center justify-center rounded-2xl bg-brand-50 text-brand-600"><Compass className="size-6" aria-hidden /></span>
        <div>
          <h1 className="text-3xl font-semibold text-slate-900">Which doctor do I need?</h1>
          <p className="mt-1 text-slate-500">Pick your concerns and we&apos;ll suggest the right specialist, with the doctors you can see soonest.</p>
        </div>
      </div>
      <Alert tone="warning" className="mb-8">{SAFETY_NOTE}</Alert>
      <Suspense fallback={<Skeleton className="h-96" />}>
        <Guide searchParams={searchParams} />
      </Suspense>
    </div>
  );
}
