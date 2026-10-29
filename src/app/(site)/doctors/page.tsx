import Link from "next/link";
import { nowMs } from "@/lib/time/now";
import type { Metadata } from "next";
import { cookies } from "next/headers";
import { SearchX } from "lucide-react";
import { Button, Card, EmptyState, Field, Input, Select } from "@/components/ui";
import { getDoctorBySlug, getDoctorSlots, getSpecialties, searchDoctors, type DoctorFilters } from "@/features/catalog/queries";
import { DoctorCard } from "@/features/catalog/components/doctor-card";
import { CONSULTATION_MODES, MODE_LABELS, type ConsultationMode } from "@/lib/domain";
import { CURRENCIES, toMinor } from "@/lib/money";
import { formatDateTime, isValidTimezone } from "@/lib/time/format";
import { TimezoneCookie } from "@/features/catalog/components/timezone-cookie";

export const metadata: Metadata = { title: "Find a doctor" };

const LANGUAGES = ["English", "Hindi", "Spanish", "Bengali", "Tamil", "Urdu", "Punjabi", "Gujarati"];
const COUNTRIES = [
  ["IN", "India"],
  ["GB", "United Kingdom"],
  ["US", "United States"],
];

function one(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

export default async function DoctorsPage({ searchParams }: PageProps<"/doctors">) {
  const params = await searchParams;
  const mode = one(params.mode) as ConsultationMode | undefined;
  const currency = one(params.currency);
  const maxFeeMajor = one(params.max_fee);
  const filters: DoctorFilters = {
    specialty: one(params.specialty) || undefined,
    mode: mode && CONSULTATION_MODES.includes(mode) ? mode : undefined,
    language: one(params.language) || undefined,
    country: one(params.country) || undefined,
    q: one(params.q)?.slice(0, 80) || undefined,
    currency: currency && CURRENCIES.includes(currency as never) ? currency : undefined,
    maxFee: currency && maxFeeMajor ? (toMinor(maxFeeMajor, currency) ?? undefined) : undefined,
  };
  const availableWithin = Number(one(params.available) ?? 0);

  const tzCookie = (await cookies()).get("tz")?.value;
  const viewerTz = tzCookie && isValidTimezone(tzCookie) ? tzCookie : "UTC";

  const [specialties, doctors] = await Promise.all([getSpecialties(), searchDoctors(filters)]);

  const withAvailability = await Promise.all(
    doctors.slice(0, 30).map(async (doctor) => {
      const detail = await getDoctorBySlug(doctor.slug);
      const slots = detail ? await getDoctorSlots(detail, filters.mode) : [];
      return { doctor, next: slots[0]?.start ?? null };
    }),
  );
  const cutoff = nowMs() + availableWithin * 86_400_000;
  const visible = availableWithin
    ? withAvailability.filter((d) => d.next && Date.parse(d.next) <= cutoff)
    : withAvailability;

  return (
    <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6">
      <TimezoneCookie current={tzCookie} />
      <h1 className="text-3xl font-semibold tracking-tight text-slate-900">Find a doctor</h1>
      <p className="mt-1 text-slate-600">
        Only verified, approved doctors are listed. Times are shown in <strong>{viewerTz}</strong>.
      </p>

      <div className="mt-8 grid gap-8 lg:grid-cols-[18rem_1fr]">
        <Card className="h-fit p-5">
          <form className="space-y-4" role="search" aria-label="Filter doctors">
            <Field label="Doctor name" htmlFor="q">
              <Input id="q" name="q" defaultValue={filters.q} placeholder="e.g. Mehta" />
            </Field>
            <Field label="Specialty" htmlFor="specialty">
              <Select id="specialty" name="specialty" defaultValue={filters.specialty ?? ""}>
                <option value="">All specialties</option>
                {specialties.map((s) => (
                  <option key={s.slug} value={s.slug}>{s.name}</option>
                ))}
              </Select>
            </Field>
            <Field label="Consultation type" htmlFor="mode">
              <Select id="mode" name="mode" defaultValue={filters.mode ?? ""}>
                <option value="">Any</option>
                {CONSULTATION_MODES.map((m) => (
                  <option key={m} value={m}>{MODE_LABELS[m]}</option>
                ))}
              </Select>
            </Field>
            <Field label="Language" htmlFor="language">
              <Select id="language" name="language" defaultValue={filters.language ?? ""}>
                <option value="">Any</option>
                {LANGUAGES.map((l) => <option key={l}>{l}</option>)}
              </Select>
            </Field>
            <Field label="Doctor's country" htmlFor="country">
              <Select id="country" name="country" defaultValue={filters.country ?? ""}>
                <option value="">Any</option>
                {COUNTRIES.map(([code, name]) => <option key={code} value={code}>{name}</option>)}
              </Select>
            </Field>
            <fieldset className="space-y-2">
              <legend className="text-sm font-medium text-slate-700">Maximum fee</legend>
              <div className="flex gap-2">
                <Select name="currency" aria-label="Currency" defaultValue={filters.currency ?? ""} className="w-24">
                  <option value="">—</option>
                  {CURRENCIES.map((c) => <option key={c}>{c}</option>)}
                </Select>
                <Input name="max_fee" aria-label="Maximum fee" inputMode="decimal" defaultValue={maxFeeMajor} placeholder="Amount" />
              </div>
              <p className="text-xs text-slate-500">Fees are set per doctor in their currency.</p>
            </fieldset>
            <Field label="Availability" htmlFor="available">
              <Select id="available" name="available" defaultValue={String(availableWithin || "")}>
                <option value="">Any time</option>
                <option value="1">Within 24 hours</option>
                <option value="3">Within 3 days</option>
                <option value="7">Within 7 days</option>
              </Select>
            </Field>
            <div className="flex gap-2">
              <Button type="submit" className="flex-1">Apply filters</Button>
              <Link href="/doctors" className="inline-flex items-center px-2 text-sm text-slate-600 hover:underline">Reset</Link>
            </div>
          </form>
        </Card>

        <section aria-live="polite">
          <p className="mb-4 text-sm text-slate-500">{visible.length} doctor{visible.length === 1 ? "" : "s"} found</p>
          {visible.length === 0 ? (
            <Card>
              <EmptyState
                icon={<SearchX className="size-6" aria-hidden />}
                title="No doctors match these filters"
                description="Try another specialty or consultation type, or clear the fee filter."
              />
            </Card>
          ) : (
            <div className="grid gap-4 md:grid-cols-2">
              {visible.map(({ doctor, next }) => (
                <DoctorCard
                  key={doctor.user_id}
                  doctor={doctor}
                  nextAvailable={next ? formatDateTime(next, viewerTz, { withZone: false }) : null}
                />
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
