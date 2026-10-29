import Link from "next/link";
import { Card, CardHeader, PageHeader } from "@/components/ui";
import { requireRole } from "@/lib/auth/viewer";
import { createClient } from "@/lib/supabase/server";
import { DoctorProfileForm, type DoctorProfileRow } from "@/features/doctor/components/profile-form";

export default async function DoctorProfilePage() {
  const viewer = await requireRole("doctor", "/doctor/profile");
  const supabase = await createClient();
  const { data: doctor } = await supabase.from("doctor_profiles").select("*").eq("user_id", viewer.id).single();
  if (!doctor) return null;
  return (
    <>
      <PageHeader
        title="Profile & fees"
        description="Fee changes apply to new bookings only; existing bookings keep the price agreed at booking."
        actions={doctor.application_status === "approved" ? <Link href={`/doctors/${doctor.slug}`} className="text-sm text-brand-700 hover:underline">View public profile</Link> : undefined}
      />
      <Card>
        <CardHeader title="Your details" />
        <div className="p-5"><DoctorProfileForm doctor={doctor as unknown as DoctorProfileRow} /></div>
      </Card>
    </>
  );
}
