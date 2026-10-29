import "server-only";
import { createClient } from "@/lib/supabase/server";
import type { AppointmentStatus, ConsultationMode } from "@/lib/domain";

export type AppointmentRow = {
  id: string;
  reference: string;
  patient_id: string;
  doctor_id: string;
  mode: ConsultationMode;
  status: AppointmentStatus;
  start_at: string;
  end_at: string;
  doctor_timezone: string;
  patient_timezone: string;
  currency: string;
  fee_amount: number;
  amount_paid: number;
  fee_snapshot: Partial<Record<ConsultationMode, number>>;
  commission_bps: number;
  payment_expires_at: string | null;
  reschedule_count: number;
  cancellation_reason: string | null;
  created_at: string;
  doctor: { title: string; display_name: string; slug: string; photo_path: string | null } | null;
  patient_name: string | null;
  patient_email: string | null;
  specialty: string | null;
  pending_change: { id: string; proposed_start_at: string } | null;
};

const SELECT = `id, reference, patient_id, doctor_id, mode, status, start_at, end_at, doctor_timezone, patient_timezone,
  currency, fee_amount, amount_paid, fee_snapshot, commission_bps, payment_expires_at, reschedule_count, cancellation_reason, created_at,
  doctor_profiles(title, display_name, slug, photo_path),
  patient_profiles(profiles(full_name, email)),
  specialties(name),
  appointment_change_requests(id, proposed_start_at, status)`;

type Raw = Omit<AppointmentRow, "doctor" | "patient_name" | "patient_email" | "specialty" | "pending_change"> & {
  doctor_profiles: AppointmentRow["doctor"];
  patient_profiles: { profiles: { full_name: string; email: string } | null } | null;
  specialties: { name: string } | null;
  appointment_change_requests: { id: string; proposed_start_at: string; status: string }[];
};

function map(r: Raw): AppointmentRow {
  const { doctor_profiles, patient_profiles, specialties, appointment_change_requests, ...rest } = r;
  const pending = appointment_change_requests?.find((c) => c.status === "pending");
  return {
    ...rest,
    doctor: doctor_profiles,
    patient_name: patient_profiles?.profiles?.full_name ?? null,
    patient_email: patient_profiles?.profiles?.email ?? null,
    specialty: specialties?.name ?? null,
    pending_change: pending ? { id: pending.id, proposed_start_at: pending.proposed_start_at } : null,
  };
}

export type AppointmentQuery = {
  scope?: "upcoming" | "past" | "today" | "all";
  status?: AppointmentStatus;
  doctorId?: string;
  patientId?: string;
  mode?: ConsultationMode;
  from?: string;
  to?: string;
  limit?: number;
};

/** RLS decides which rows the viewer may see; filters only narrow that set. */
export async function listAppointments(q: AppointmentQuery = {}): Promise<AppointmentRow[]> {
  const supabase = await createClient();
  const now = new Date().toISOString();
  let query = supabase.from("appointments").select(SELECT);
  if (q.scope === "upcoming") query = query.gte("end_at", now).in("status", ["pending_payment", "confirmed", "in_progress"]).order("start_at");
  else if (q.scope === "past") query = query.or(`end_at.lt.${now},status.in.(completed,cancelled,no_show,refunded,expired)`).order("start_at", { ascending: false });
  else query = query.order("start_at", { ascending: q.scope === "today" });
  if (q.status) query = query.eq("status", q.status);
  if (q.doctorId) query = query.eq("doctor_id", q.doctorId);
  if (q.patientId) query = query.eq("patient_id", q.patientId);
  if (q.mode) query = query.eq("mode", q.mode);
  if (q.from) query = query.gte("start_at", q.from);
  if (q.to) query = query.lt("start_at", q.to);
  const { data, error } = await query.limit(q.limit ?? 100);
  if (error) throw new Error("Could not load appointments");
  return (data as unknown as Raw[]).map(map);
}

export async function getAppointment(id: string): Promise<AppointmentRow | null> {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  const supabase = await createClient();
  const { data } = await supabase.from("appointments").select(SELECT).eq("id", id).maybeSingle();
  return data ? map(data as unknown as Raw) : null;
}

export async function getAppointmentEvents(id: string) {
  const supabase = await createClient();
  const { data } = await supabase
    .from("appointment_events")
    .select("id, event, from_status, to_status, metadata, created_at")
    .eq("appointment_id", id)
    .order("created_at");
  return data ?? [];
}

export async function getIntake(id: string) {
  const supabase = await createClient();
  const { data } = await supabase.from("appointment_intakes").select("reason_for_visit, symptoms_duration").eq("appointment_id", id).maybeSingle();
  return data;
}
