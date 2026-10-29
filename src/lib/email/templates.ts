import { formatDateTime } from "@/lib/time/format";
import { formatMoney } from "@/lib/money";
import { MODE_LABELS, APPOINTMENT_STATUS_LABELS, type AppointmentStatus, type ConsultationMode } from "@/lib/domain";

export type EmailContent = { subject: string; html: string; text: string };

type Payload = Record<string, unknown> & {
  link?: string;
  reference?: string;
  start_at?: string;
  mode?: ConsultationMode;
  status?: AppointmentStatus;
  patient_name?: string;
  doctor_name?: string;
  recipient_role?: "patient" | "doctor";
  recipient_timezone?: string;
  proposed_start_at?: string;
  amount?: number;
  currency?: string;
  note?: string;
};

const esc = (s: unknown) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

/** Appointment details block: date, time with explicit zone, type, status, counterpart. Never clinical data. */
function appointmentLines(p: Payload): string[] {
  const tz = p.recipient_timezone || "UTC";
  const lines: string[] = [];
  if (p.start_at) lines.push(`When: ${formatDateTime(p.start_at, tz)}`);
  if (p.proposed_start_at) lines.push(`Requested new time: ${formatDateTime(p.proposed_start_at, tz)}`);
  if (p.mode) lines.push(`Consultation: ${MODE_LABELS[p.mode]}`);
  if (p.recipient_role === "doctor" && p.patient_name) lines.push(`Patient: ${p.patient_name}`);
  if (p.recipient_role !== "doctor" && p.doctor_name) lines.push(`Doctor: ${p.doctor_name}`);
  if (p.status) lines.push(`Status: ${APPOINTMENT_STATUS_LABELS[p.status] ?? p.status}`);
  if (p.reference) lines.push(`Reference: ${p.reference}`);
  return lines;
}

const SUBJECTS: Record<string, (p: Payload) => [string, string]> = {
  appointment_confirmed: () => ["Your consultation is confirmed", "Your appointment is confirmed. Join from your account at the scheduled time."],
  appointment_cancelled: () => ["Appointment cancelled", "This appointment has been cancelled. Any refund due has been initiated."],
  appointment_upgraded: () => ["Consultation type updated", "The consultation type for this appointment has changed."],
  reschedule_requested: () => ["Reschedule request received", "We've received your request. Your original appointment stays booked until it's approved."],
  reschedule_approved: () => ["Appointment rescheduled", "This appointment has moved to a new time."],
  reschedule_rejected: () => ["Reschedule request declined", "The requested time couldn't be approved. Your original appointment is unchanged."],
  reminder_24h: () => ["Reminder: consultation within 24 hours", "This is a reminder of your upcoming consultation."],
  reminder_1h: () => ["Starting soon: your consultation", "Your consultation starts within the hour. The room opens shortly before the start time."],
  consultation_completed: () => ["Consultation completed", "Your consultation has been marked as completed."],
  prescription_available: () => ["A new prescription is available", "Your doctor has issued a prescription. Sign in to view or print it."],
  payment_refund_queued: () => ["Your payment will be refunded", "We couldn't complete your booking, so your payment is being refunded in full."],
  refund_processed: (p) => ["Refund processed", `A refund${p.amount && p.currency ? ` of ${formatMoney(p.amount, p.currency)}` : ""} has been processed. It may take a few days to appear.`],
  doctor_application_submitted: () => ["Application received", "Thanks for applying. Our team will review your details and documents."],
  doctor_application_approved: () => ["You're approved on Docothink", "Your profile is approved. Set your availability so patients can book you."],
  doctor_application_info_required: (p) => ["More information needed", `Our review team needs more information.${p.note ? ` Note: ${p.note}` : ""}`],
  doctor_application_rejected: (p) => ["Application update", `We're unable to approve your application at this time.${p.note ? ` Note: ${p.note}` : ""}`],
  doctor_application_suspended: (p) => ["Account suspended", `Your doctor account has been suspended.${p.note ? ` Note: ${p.note}` : ""}`],
  doctor_application_approved_reinstated: () => ["Account reinstated", "Your doctor account is active again."],
};

export function renderEmail(template: string, payload: Payload, siteUrl: string, brand = "Docothink"): EmailContent {
  const isPayout = template.startsWith("payout_");
  const [subject, intro] = isPayout
    ? [`Payout ${template.replace("payout_", "").replace("_", " ")}`, `A payout${payload.amount && payload.currency ? ` of ${formatMoney(payload.amount, payload.currency)}` : ""} is now ${template.replace("payout_", "").replace("_", " ")}.`]
    : (SUBJECTS[template]?.(payload) ?? ["Update from Docothink", "There's an update in your account."]);
  const details = appointmentLines(payload);
  const url = payload.link ? `${siteUrl}${payload.link}` : siteUrl;
  const text = [intro, "", ...details, "", `Open in ${brand}: ${url}`, "", "Not for emergencies: call 911 (US), 999 (UK) or 112 (India)."].join("\n");
  const html = `<!doctype html><html><body style="margin:0;background:#f8fafc;font-family:Arial,Helvetica,sans-serif;color:#1e293b">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:24px">
<table role="presentation" width="560" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border:1px solid #e2e8f0;border-radius:12px">
<tr><td style="padding:24px 28px 8px;font-size:18px;font-weight:bold;color:#1d4ed8">${esc(brand)}</td></tr>
<tr><td style="padding:8px 28px;font-size:16px;font-weight:bold">${esc(subject)}</td></tr>
<tr><td style="padding:4px 28px 12px;font-size:14px;line-height:1.5">${esc(intro)}</td></tr>
${details.length ? `<tr><td style="padding:0 28px 12px"><table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;background:#f1f5f9;border-radius:8px"><tr><td style="padding:12px 16px;font-size:14px;line-height:1.7">${details.map(esc).join("<br>")}</td></tr></table></td></tr>` : ""}
<tr><td style="padding:8px 28px 24px"><a href="${esc(url)}" style="display:inline-block;background:#1d4ed8;color:#ffffff;text-decoration:none;padding:10px 18px;border-radius:8px;font-size:14px">Open your account</a></td></tr>
<tr><td style="padding:16px 28px;border-top:1px solid #e2e8f0;font-size:12px;color:#64748b">For your privacy we never include medical details or attachments in email. Not for emergencies: call 911 (US), 999 (UK) or 112 (India).</td></tr>
</table></td></tr></table></body></html>`;
  return { subject, html, text };
}
