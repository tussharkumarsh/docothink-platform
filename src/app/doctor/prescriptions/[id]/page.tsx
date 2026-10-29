import { notFound } from "next/navigation";
import { Card, PageHeader } from "@/components/ui";
import { requireApprovedDoctor } from "@/lib/auth/viewer";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { PRESCRIPTION_SELECT, PrescriptionDocument, type PrescriptionView } from "@/features/prescriptions/components/prescription-document";

/** A finalised record from the patient's history; RLS requires a treating relationship or grant. */
export default async function DoctorRecordPage({ params }: PageProps<"/doctor/prescriptions/[id]">) {
  const { id } = await params;
  const viewer = await requireApprovedDoctor();
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const supabase = await createClient();
  const { data } = await supabase.from("prescriptions").select(`${PRESCRIPTION_SELECT}, patient_id`).eq("id", id).maybeSingle();
  if (!data) notFound();
  await createAdminClient().rpc("audit_as", { p_actor: viewer.id, p_action: "prescription.view", p_entity_type: "prescription", p_entity_id: id, p_metadata: {} });
  return (
    <>
      <PageHeader title="Clinical record" />
      <Card><PrescriptionDocument rx={data as unknown as PrescriptionView} timezone={viewer.timezone} /></Card>
    </>
  );
}
