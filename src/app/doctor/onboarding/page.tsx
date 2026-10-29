import Link from "next/link";
import { Alert, Badge, Card, CardHeader, PageHeader, Select, Table } from "@/components/ui";
import { ActionForm, ConfirmSubmit } from "@/components/ui/form-client";
import { requireRole } from "@/lib/auth/viewer";
import { createClient } from "@/lib/supabase/server";
import { DoctorProfileForm, type DoctorProfileRow } from "@/features/doctor/components/profile-form";
import { setSpecialtiesAction, submitApplicationAction } from "@/features/doctor/actions";
import { Uploader } from "@/features/documents/components/uploader";
import { deleteCredentialAction } from "@/features/documents/actions";
import { APPLICATION_STATUS_LABELS, type DoctorApplicationStatus } from "@/lib/domain";
import { formatDateTime } from "@/lib/time/format";

const STATUS_TONE: Record<DoctorApplicationStatus, "neutral" | "info" | "success" | "warning" | "danger"> = {
  draft: "neutral", submitted: "info", under_review: "info", info_required: "warning", approved: "success", rejected: "danger", suspended: "danger",
};

export default async function OnboardingPage() {
  const viewer = await requireRole("doctor", "/doctor/onboarding");
  const supabase = await createClient();
  const [{ data: doctor }, { data: specialties }, { data: mine }, { data: credentials }, { data: events }] = await Promise.all([
    supabase.from("doctor_profiles").select("*").eq("user_id", viewer.id).single(),
    supabase.from("specialties").select("id, name").eq("is_active", true).order("name"),
    supabase.from("doctor_specialties").select("specialty_id, is_primary").eq("doctor_id", viewer.id),
    supabase.from("doctor_credentials").select("id, kind, file_name, status, review_note, created_at").eq("doctor_id", viewer.id).order("created_at"),
    supabase.from("doctor_application_events").select("id, to_status, note, created_at").eq("doctor_id", viewer.id).order("created_at", { ascending: false }),
  ]);
  if (!doctor) return null;
  const status = doctor.application_status as DoctorApplicationStatus;
  const editable = status === "draft" || status === "info_required";
  const selected = new Set((mine ?? []).map((s) => s.specialty_id));
  const primary = mine?.find((s) => s.is_primary)?.specialty_id;
  const latestNote = events?.find((e) => e.note && ["info_required", "rejected", "suspended"].includes(e.to_status));

  return (
    <>
      <PageHeader title="Verification & onboarding" description="Complete each step, then submit your application for review." actions={<Badge tone={STATUS_TONE[status]}>{APPLICATION_STATUS_LABELS[status]}</Badge>} />
      <div className="space-y-6">
        {status === "approved" && <Alert tone="success" title="You're approved">Your profile is live. <Link href="/doctor/availability" className="underline">Set your availability</Link> so patients can book.</Alert>}
        {(status === "submitted" || status === "under_review") && <Alert tone="info" title="Application under review">We&apos;ll email you when there&apos;s an update.</Alert>}
        {latestNote && <Alert tone={status === "info_required" ? "warning" : "danger"} title="Message from the review team">{latestNote.note}</Alert>}

        <Card>
          <CardHeader title="1. Professional profile & fees" />
          <div className="p-5"><DoctorProfileForm doctor={doctor as unknown as DoctorProfileRow} /></div>
        </Card>

        <Card>
          <CardHeader title="2. Specialties" description="Choose up to 5 and mark your primary specialty." />
          <div className="p-5">
            <ActionForm action={setSpecialtiesAction} submitLabel="Save specialties">
              <div className="grid gap-2 sm:grid-cols-3">
                {specialties?.map((s) => (
                  <label key={s.id} className="flex items-center gap-2 text-sm">
                    <input type="checkbox" name="specialty_ids" value={s.id} defaultChecked={selected.has(s.id)} /> {s.name}
                  </label>
                ))}
              </div>
              <label className="block max-w-xs text-sm font-medium text-slate-700">
                Primary specialty
                <Select name="primary" defaultValue={primary ?? ""} className="mt-1">
                  <option value="">First selected</option>
                  {specialties?.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                </Select>
              </label>
            </ActionForm>
          </div>
        </Card>

        <Card>
          <CardHeader title="3. Verification documents" description="Registration certificate and identity document are required. Files are private: only you and the verification team can open them." />
          <div className="space-y-5 p-5">
            {credentials?.length ? (
              <Table>
                <thead><tr><th>Document</th><th>File</th><th>Status</th><th /></tr></thead>
                <tbody>
                  {credentials.map((c) => (
                    <tr key={c.id}>
                      <td className="capitalize">{c.kind.replaceAll("_", " ")}</td>
                      <td><a href={`/api/files/credentials/${c.id}`} className="text-brand-700 hover:underline">{c.file_name}</a></td>
                      <td>
                        <Badge tone={c.status === "verified" ? "success" : c.status === "rejected" ? "danger" : "neutral"}>{c.status}</Badge>
                        {c.review_note && <span className="block text-xs text-slate-500">{c.review_note}</span>}
                      </td>
                      <td className="text-right">
                        {editable && c.status === "pending" && (
                          <form action={deleteCredentialAction}>
                            <input type="hidden" name="credential_id" value={c.id} />
                            <ConfirmSubmit message="Remove this document?" variant="ghost" size="sm">Remove</ConfirmSubmit>
                          </form>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            ) : (
              <p className="text-sm text-slate-500">No documents uploaded yet.</p>
            )}
            {status !== "rejected" && <Uploader kind="credential" />}
          </div>
        </Card>

        {editable && (
          <Card>
            <CardHeader title="4. Terms and submission" />
            <div className="p-5">
              <ActionForm action={submitApplicationAction} submitLabel="Submit application">
                <label className="flex items-start gap-2 text-sm text-slate-700">
                  <input type="checkbox" name="accept_terms" className="mt-1" />
                  <span>
                    I confirm my registration is valid and the information is accurate. I agree to the doctor terms, including practising within
                    my scope and applicable law, and the platform commission deducted from each consultation fee.
                  </span>
                </label>
              </ActionForm>
            </div>
          </Card>
        )}

        {!!events?.length && (
          <Card>
            <CardHeader title="Application history" />
            <ol className="space-y-2 p-5 text-sm">
              {events.map((e) => (
                <li key={e.id} className="flex gap-3">
                  <span className="w-48 shrink-0 text-slate-500">{formatDateTime(e.created_at, viewer.timezone, { withZone: false })}</span>
                  <span>{APPLICATION_STATUS_LABELS[e.to_status as DoctorApplicationStatus]}{e.note ? ` — ${e.note}` : ""}</span>
                </li>
              ))}
            </ol>
          </Card>
        )}
      </div>
    </>
  );
}
