import Link from "next/link";
import { Star } from "lucide-react";
import { Badge, Button, Card, EmptyState, Input, PageHeader, Select, Table } from "@/components/ui";
import { requirePermission } from "@/lib/auth/viewer";
import { createClient } from "@/lib/supabase/server";
import { formatDate } from "@/lib/time/format";
import { moderateReviewAction } from "@/features/admin/actions";
import { StarRow } from "@/features/reviews/components/rating-summary";

const STATUSES = [
  ["pending", "Awaiting moderation"],
  ["approved", "Published"],
  ["hidden", "Hidden"],
  ["none", "Stars only (no comment)"],
] as const;

type Row = {
  id: string;
  rating: number;
  comment: string | null;
  comment_status: string;
  is_anonymous: boolean;
  created_at: string;
  appointment_id: string;
  appointments: { reference: string } | null;
  doctor_profiles: { display_name: string } | null;
  patient_profiles: { profiles: { full_name: string | null; email: string } | null } | null;
};

export default async function AdminReviewsPage({ searchParams }: PageProps<"/admin/reviews">) {
  await requirePermission("reviews.manage");
  const p = await searchParams;
  const status = STATUSES.some(([s]) => s === p.status) ? String(p.status) : "pending";
  const rating = Number(p.rating);
  const doctorQ = typeof p.doctor === "string" ? p.doctor.slice(0, 80).replace(/[%_,()]/g, "") : "";

  const supabase = await createClient();
  let query = supabase
    .from("doctor_reviews")
    .select(
      `id, rating, comment, comment_status, is_anonymous, created_at, appointment_id, appointments(reference),
       doctor_profiles${doctorQ ? "!inner" : ""}(display_name), patient_profiles(profiles(full_name, email))`,
    )
    .eq("comment_status", status)
    .order("created_at", { ascending: status === "pending" })
    .limit(200);
  if (rating >= 1 && rating <= 5) query = query.eq("rating", rating);
  if (doctorQ) query = query.ilike("doctor_profiles.display_name", `%${doctorQ}%`);
  const { data } = await query;
  const rows = (data ?? []) as unknown as Row[];

  return (
    <>
      <PageHeader
        title="Reviews"
        description="Stars count toward a doctor's rating straight away. Written comments are public only after you approve them."
      />
      <form className="mb-4 flex flex-wrap gap-2">
        <Select name="status" defaultValue={status} aria-label="Status" className="w-56">
          {STATUSES.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
        </Select>
        <Select name="rating" defaultValue={rating ? String(rating) : ""} aria-label="Rating" className="w-36">
          <option value="">Any rating</option>
          {[5, 4, 3, 2, 1].map((n) => <option key={n} value={n}>{n} star{n === 1 ? "" : "s"}</option>)}
        </Select>
        <Input name="doctor" defaultValue={doctorQ} placeholder="Doctor name" aria-label="Doctor name" className="max-w-xs" />
        <Button type="submit" variant="secondary">Filter</Button>
      </form>
      <Card>
        {rows.length === 0 ? (
          <EmptyState icon={<Star className="size-6" aria-hidden />} title="Nothing here" description={status === "pending" ? "No comments are waiting for moderation." : "No reviews match these filters."} />
        ) : (
          <Table>
            <thead><tr><th>Date</th><th>Doctor</th><th>Patient</th><th>Rating</th><th>Comment</th><th>Appointment</th><th /></tr></thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="align-top">
                  <td className="whitespace-nowrap">{formatDate(r.created_at)}</td>
                  <td>{r.doctor_profiles?.display_name ?? "—"}</td>
                  <td>
                    <p className="text-slate-900">{r.patient_profiles?.profiles?.full_name || "—"}</p>
                    <p className="text-xs text-slate-500">{r.patient_profiles?.profiles?.email}</p>
                    {r.is_anonymous && <Badge className="mt-1">Posts anonymously</Badge>}
                  </td>
                  <td><StarRow rating={r.rating} /></td>
                  <td className="max-w-md whitespace-pre-wrap text-slate-700">{r.comment ?? <span className="text-slate-400">No comment</span>}</td>
                  <td><Link href={`/admin/appointments/${r.appointment_id}`} className="text-brand-700 hover:underline">{r.appointments?.reference ?? "Open"}</Link></td>
                  <td className="text-right">
                    {r.comment_status !== "none" && (
                      <form action={moderateReviewAction} className="flex justify-end gap-2">
                        <input type="hidden" name="review_id" value={r.id} />
                        {r.comment_status !== "approved" && <Button type="submit" name="status" value="approved" size="sm">Approve</Button>}
                        {r.comment_status !== "hidden" && <Button type="submit" name="status" value="hidden" size="sm" variant="secondary">Hide</Button>}
                      </form>
                    )}
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
