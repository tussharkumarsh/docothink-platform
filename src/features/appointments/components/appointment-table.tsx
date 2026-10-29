import Link from "next/link";
import { CalendarDays } from "lucide-react";
import { EmptyState, Table } from "@/components/ui";
import { MODE_LABELS } from "@/lib/domain";
import { formatDateTime } from "@/lib/time/format";
import { formatMoney } from "@/lib/money";
import type { AppointmentRow } from "../queries";
import { StatusBadge } from "./status-badge";

/** One table for all portals; `perspective` decides which party and which zone to show. */
export function AppointmentTable({
  rows,
  perspective,
  timezone,
  hrefBase,
}: {
  rows: AppointmentRow[];
  perspective: "patient" | "doctor" | "admin";
  timezone: string;
  hrefBase: string;
}) {
  if (rows.length === 0) return <EmptyState icon={<CalendarDays className="size-6" aria-hidden />} title="No appointments" />;
  return (
    <Table>
      <thead>
        <tr>
          <th>When ({timezone})</th>
          {perspective !== "patient" && <th>Patient</th>}
          {perspective !== "doctor" && <th>Doctor</th>}
          <th>Type</th>
          <th>Status</th>
          {perspective === "admin" && <th className="text-right">Fee</th>}
          <th><span className="sr-only">Open</span></th>
        </tr>
      </thead>
      <tbody>
        {rows.map((a) => (
          <tr key={a.id} className="hover:bg-slate-50">
            <td className="whitespace-nowrap">
              {formatDateTime(a.start_at, timezone, { withZone: false })}
              {perspective === "admin" && (
                <span className="block text-xs text-slate-500">Dr: {a.doctor_timezone} · Pt: {a.patient_timezone}</span>
              )}
            </td>
            {perspective !== "patient" && <td>{a.patient_name ?? <span className="text-slate-400">Awaiting payment</span>}</td>}
            {perspective !== "doctor" && <td>{a.doctor ? `${a.doctor.title} ${a.doctor.display_name}` : "—"}</td>}
            <td>{MODE_LABELS[a.mode]}</td>
            <td><StatusBadge status={a.status} changeRequested={!!a.pending_change} rescheduled={a.reschedule_count > 0} /></td>
            {perspective === "admin" && <td className="text-right tabular-nums">{formatMoney(a.fee_amount, a.currency)}</td>}
            <td className="text-right">
              <Link href={`${hrefBase}/${a.id}`} className="text-sm font-medium text-brand-700 hover:underline">Open</Link>
            </td>
          </tr>
        ))}
      </tbody>
    </Table>
  );
}
