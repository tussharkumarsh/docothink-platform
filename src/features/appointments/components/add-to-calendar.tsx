import { CalendarPlus } from "lucide-react";
import { buttonClasses } from "@/components/ui";
import { googleCalendarUrl } from "@/lib/calendar";
import { publicEnv } from "@/lib/env";
import { MODE_LABELS, type ConsultationMode } from "@/lib/domain";

/** Calendar file (Apple, Outlook) and a Google Calendar link. No names or clinical text go into calendars. */
export function AddToCalendar(props: { appointmentId: string; start: string; end: string; mode: ConsultationMode; reference: string }) {
  const join = `${publicEnv.siteUrl}/consult/${props.appointmentId}`;
  const google = googleCalendarUrl({
    start: props.start,
    end: props.end,
    summary: `Docothink consultation · ${MODE_LABELS[props.mode]}`,
    description: `Join: ${join}\nReference: ${props.reference}`,
    url: join,
  });
  return (
    <div className="flex flex-wrap gap-2">
      <a href={`/api/appointments/${props.appointmentId}/calendar.ics`} download className={buttonClasses("secondary", "sm")}>
        <CalendarPlus className="size-4" aria-hidden /> Add to calendar
      </a>
      <a href={google} target="_blank" rel="noopener noreferrer" className={buttonClasses("secondary", "sm")}>
        Google Calendar
      </a>
    </div>
  );
}
