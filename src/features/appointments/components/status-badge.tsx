import { Badge } from "@/components/ui";
import { APPOINTMENT_STATUS_LABELS, type AppointmentStatus } from "@/lib/domain";

const TONES: Record<AppointmentStatus, "neutral" | "info" | "success" | "warning" | "danger"> = {
  pending_payment: "warning",
  confirmed: "info",
  in_progress: "success",
  completed: "neutral",
  cancelled: "danger",
  no_show: "danger",
  refunded: "neutral",
  expired: "neutral",
};

export function StatusBadge({ status, changeRequested, rescheduled }: { status: AppointmentStatus; changeRequested?: boolean; rescheduled?: boolean }) {
  return (
    <span className="inline-flex flex-wrap gap-1">
      <Badge tone={TONES[status]}>{APPOINTMENT_STATUS_LABELS[status]}</Badge>
      {changeRequested && <Badge tone="warning">Change requested</Badge>}
      {rescheduled && <Badge tone="neutral">Rescheduled</Badge>}
    </span>
  );
}
