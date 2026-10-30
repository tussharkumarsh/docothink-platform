import Link from "next/link";
import { Card, CardHeader, PageHeader } from "@/components/ui";
import { requireRole } from "@/lib/auth/viewer";
import { createClient } from "@/lib/supabase/server";
import { formatDate } from "@/lib/time/format";
import { DoctorProfileForm, type DoctorProfileRow } from "@/features/doctor/components/profile-form";
import { ProfessionalForm, type ProfessionalRow } from "@/features/doctor/components/professional-form";
import { AddressForm, type PrivateDetailsRow } from "@/features/doctor/components/address-form";
import { BankForm } from "@/features/doctor/components/bank-form";
import { Uploader } from "@/features/documents/components/uploader";
import { BANK_COUNTRIES, type BankCountry } from "@/features/doctor/kyc";

const TABS = [
  { key: "public", label: "Public profile" },
  { key: "professional", label: "Professional details" },
  { key: "address", label: "Address" },
  { key: "bank", label: "Bank & tax" },
] as const;
type Tab = (typeof TABS)[number]["key"];

export default async function DoctorProfilePage({ searchParams }: PageProps<"/doctor/profile">) {
  const viewer = await requireRole("doctor", "/doctor/profile");
  const sp = await searchParams;
  const tab: Tab = TABS.some((t) => t.key === sp.tab) ? (sp.tab as Tab) : "public";
  const supabase = await createClient();
  const [{ data: doctor }, { data: details }, { data: proofs }] = await Promise.all([
    supabase.from("doctor_profiles").select("*").eq("user_id", viewer.id).single(),
    supabase.from("doctor_private_details").select("*").eq("doctor_id", viewer.id).maybeSingle(),
    supabase.from("doctor_credentials").select("id, file_name, status, created_at").eq("doctor_id", viewer.id).eq("kind", "bank_proof").order("created_at", { ascending: false }),
  ]);
  if (!doctor) return null;
  const row = details as PrivateDetailsRow | null;
  const countryParam = typeof sp.country === "string" ? sp.country.toUpperCase() : "";
  const country: BankCountry = BANK_COUNTRIES.includes(countryParam as BankCountry)
    ? (countryParam as BankCountry)
    : ((row?.bank_country as BankCountry | null) ?? (BANK_COUNTRIES.includes(doctor.country) ? doctor.country : "IN"));

  return (
    <>
      <PageHeader
        title="Profile & fees"
        description="Fee changes apply to new bookings only; existing bookings keep the price agreed at booking."
        actions={doctor.application_status === "approved" ? <Link href={`/doctors/${doctor.slug}`} className="text-sm text-brand-700 hover:underline">View public profile</Link> : undefined}
      />
      <nav aria-label="Profile sections" className="mb-6 flex flex-wrap gap-1.5">
        {TABS.map((t) => (
          <Link
            key={t.key}
            href={`/doctor/profile?tab=${t.key}`}
            aria-current={tab === t.key ? "page" : undefined}
            className={tab === t.key ? "rounded-full bg-slate-900 px-4 py-1.5 text-sm font-medium text-white" : "rounded-full bg-white px-4 py-1.5 text-sm text-slate-700 ring-1 ring-black/5 hover:bg-slate-100"}
          >
            {t.label}
          </Link>
        ))}
      </nav>

      {tab === "public" && (
        <Card>
          <CardHeader title="Your details" />
          <div className="p-5"><DoctorProfileForm doctor={doctor as unknown as DoctorProfileRow} /></div>
        </Card>
      )}
      {tab === "professional" && (
        <Card>
          <CardHeader title="Professional details" description="Shown on your public profile. Sections you leave empty are hidden." />
          <div className="p-5"><ProfessionalForm doctor={doctor as unknown as ProfessionalRow} /></div>
        </Card>
      )}
      {tab === "address" && (
        <Card>
          <CardHeader title="Address" />
          <div className="p-5"><AddressForm details={row} /></div>
        </Card>
      )}
      {tab === "bank" && (
        <>
          <Card>
            <CardHeader title="Bank & tax details" description="Settlements are paid to this account once our finance team has verified it. Visible only to you and authorised finance staff." />
            <div className="p-5"><BankForm details={row} country={country} /></div>
          </Card>
          <Card className="mt-6">
            <CardHeader title="Bank proof" description="A cancelled cheque or a recent bank statement showing your name and account number." />
            <div className="space-y-4 p-5">
              {(proofs?.length ?? 0) > 0 && (
                <ul className="space-y-1 text-sm text-slate-700">
                  {proofs!.map((p) => <li key={p.id}>{p.file_name} · <span className="text-slate-500">{p.status} · {formatDate(p.created_at, viewer.timezone)}</span></li>)}
                </ul>
              )}
              <Uploader kind="credential" fixedKind="bank_proof" />
            </div>
          </Card>
        </>
      )}
    </>
  );
}
