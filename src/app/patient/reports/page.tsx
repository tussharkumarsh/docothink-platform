import { FileText } from "lucide-react";
import { Badge, Card, CardHeader, EmptyState, PageHeader, Table } from "@/components/ui";
import { ConfirmSubmit } from "@/components/ui/form-client";
import { requireRole } from "@/lib/auth/viewer";
import { createClient } from "@/lib/supabase/server";
import { Uploader } from "@/features/documents/components/uploader";
import { deleteMedicalDocumentAction } from "@/features/documents/actions";
import { getPlatformSettings } from "@/features/appointments/settings";
import { listAppointments } from "@/features/appointments/queries";
import { formatDateTime } from "@/lib/time/format";

export default async function ReportsPage() {
  const viewer = await requireRole("patient", "/patient/reports");
  const supabase = await createClient();
  const [{ data: docs }, settings, upcoming] = await Promise.all([
    supabase.from("medical_documents").select("id, title, category, file_name, size_bytes, status, created_at").eq("patient_id", viewer.id).eq("status", "available").order("created_at", { ascending: false }),
    getPlatformSettings(),
    listAppointments({ scope: "upcoming", limit: 20 }),
  ]);
  return (
    <>
      <PageHeader title="Medical reports" description="Stored privately. Visible to you and to doctors who are treating you or whom you've shared records with." />
      <Card className="mb-6">
        <CardHeader title="Upload a report" />
        <div className="p-5">
          <Uploader
            kind="medical"
            maxMb={settings.uploads.max_file_mb}
            appointments={upcoming.map((a) => ({ id: a.id, label: `${formatDateTime(a.start_at, viewer.timezone, { withZone: false })} · ${a.doctor?.display_name ?? ""}` }))}
          />
        </div>
      </Card>
      <Card>
        <CardHeader title="Your reports" />
        {!docs?.length ? (
          <EmptyState icon={<FileText className="size-6" aria-hidden />} title="No reports yet" description="Upload lab results, scans or previous prescriptions for your doctors." />
        ) : (
          <Table>
            <thead><tr><th>Title</th><th>Type</th><th>Uploaded</th><th>Size</th><th /></tr></thead>
            <tbody>
              {docs.map((d) => (
                <tr key={d.id}>
                  <td className="font-medium text-slate-900">{d.title}</td>
                  <td><Badge>{d.category.replace("_", " ")}</Badge></td>
                  <td>{formatDateTime(d.created_at, viewer.timezone, { withZone: false })}</td>
                  <td className="tabular-nums">{(d.size_bytes / 1048576).toFixed(1)} MB</td>
                  <td className="flex justify-end gap-3">
                    <a href={`/api/files/documents/${d.id}`} className="text-sm font-medium text-brand-700 hover:underline">Download</a>
                    <form action={deleteMedicalDocumentAction}>
                      <input type="hidden" name="document_id" value={d.id} />
                      <ConfirmSubmit message="Delete this report? Doctors will no longer be able to see it." variant="ghost" size="sm">Delete</ConfirmSubmit>
                    </form>
                  </td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>
    </>
  );
}
