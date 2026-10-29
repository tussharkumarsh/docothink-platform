// Shared domain vocabulary. Mirrors the Postgres enums in supabase/migrations.

export const CONSULTATION_MODES = ["chat", "audio", "video"] as const;
export type ConsultationMode = (typeof CONSULTATION_MODES)[number];

export const MODE_LABELS: Record<ConsultationMode, string> = {
  chat: "Text chat",
  audio: "Audio call",
  video: "Video call",
};

export type AppRole = "patient" | "doctor" | "admin";

export type AppointmentStatus =
  | "pending_payment"
  | "confirmed"
  | "in_progress"
  | "completed"
  | "cancelled"
  | "no_show"
  | "refunded"
  | "expired";

export const APPOINTMENT_STATUS_LABELS: Record<AppointmentStatus, string> = {
  pending_payment: "Pending payment",
  confirmed: "Confirmed",
  in_progress: "In progress",
  completed: "Completed",
  cancelled: "Cancelled",
  no_show: "No show",
  refunded: "Refunded",
  expired: "Expired",
};

/** Same table as public.appointment_transition_allowed(). */
const TRANSITIONS: Record<AppointmentStatus, AppointmentStatus[]> = {
  pending_payment: ["confirmed", "expired", "cancelled"],
  expired: ["confirmed"],
  confirmed: ["in_progress", "cancelled", "no_show"],
  in_progress: ["completed", "cancelled"],
  cancelled: ["refunded"],
  no_show: ["refunded"],
  completed: ["refunded"],
  refunded: [],
};

export function canTransition(from: AppointmentStatus, to: AppointmentStatus): boolean {
  return from === to || TRANSITIONS[from].includes(to);
}

export type DoctorApplicationStatus =
  | "draft"
  | "submitted"
  | "under_review"
  | "info_required"
  | "approved"
  | "rejected"
  | "suspended";

export const APPLICATION_STATUS_LABELS: Record<DoctorApplicationStatus, string> = {
  draft: "Draft",
  submitted: "Submitted",
  under_review: "Under review",
  info_required: "More information required",
  approved: "Approved",
  rejected: "Rejected",
  suspended: "Suspended",
};

export type PayoutStatus = "pending" | "under_review" | "approved" | "processing" | "paid" | "failed" | "on_hold";

export const ADMIN_PERMISSIONS = [
  "*",
  "doctors.manage",
  "patients.manage",
  "appointments.manage",
  "finance.manage",
  "settings.manage",
  "clinical.read",
  "audit.read",
] as const;
export type AdminPermission = (typeof ADMIN_PERMISSIONS)[number];
