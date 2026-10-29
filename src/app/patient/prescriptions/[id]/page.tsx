import { notFound } from "next/navigation";
import { Card } from "@/components/ui";
import { PrintButton } from "@/features/prescriptions/components/print-button";
import { requireRole } from "@/lib/auth/viewer";
import { createClient } from "@/lib/supabase/server";
import { PRESCRIPTION_SELECT, PrescriptionDocument, type PrescriptionView } from "@/features/prescriptions/components/prescription-document";

export default async function PatientPrescriptionPage({ params }: PageProps<"/patient/prescriptions/[id]">) {
  const { id } = await params;
  const viewer = await requireRole("patient", `/patient/prescriptions/${id}`);
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const supabase = await createClient();
  // RLS: patients only ever see their own final/superseded versions.
  const { data } = await supabase.from("prescriptions").select(PRESCRIPTION_SELECT).eq("id", id).maybeSingle();
  if (!data) notFound();
  return (
    <>
      <div className="mb-4 flex justify-end no-print"><PrintButton /></div>
      <Card><PrescriptionDocument rx={data as unknown as PrescriptionView} timezone={viewer.timezone} /></Card>
    </>
  );
}
