import { notFound } from "next/navigation";
import { Card } from "@/components/ui";
import { PrintButton } from "@/features/prescriptions/components/print-button";
import { requireRole } from "@/lib/auth/viewer";
import { createClient } from "@/lib/supabase/server";
import { getPlatformSettings } from "@/features/appointments/settings";
import { formatMoney } from "@/lib/money";
import { formatDateTime } from "@/lib/time/format";
import { MODE_LABELS, type ConsultationMode } from "@/lib/domain";

export default async function ReceiptPage({ params }: PageProps<"/patient/payments/[id]">) {
  const { id } = await params;
  const viewer = await requireRole("patient", `/patient/payments/${id}`);
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const supabase = await createClient();
  const [{ data: payment }, settings] = await Promise.all([
    supabase
      .from("payment_records")
      .select("id, purpose, amount, amount_refunded, currency, status, provider_payment_id, succeeded_at, appointments(reference, mode, start_at, doctor_profiles(title, display_name))")
      .eq("id", id)
      .in("status", ["succeeded", "partially_refunded", "refunded"])
      .maybeSingle(),
    getPlatformSettings(),
  ]);
  if (!payment) notFound();
  const appt = payment!.appointments as unknown as { reference: string; mode: ConsultationMode; start_at: string; doctor_profiles: { title: string; display_name: string } | null };
  return (
    <>
      <div className="mb-4 flex justify-end no-print"><PrintButton label="Print receipt" /></div>
      <Card className="mx-auto max-w-xl p-8">
        <p className="text-lg font-semibold text-slate-900">{settings.branding.name} · Receipt</p>
        <p className="text-sm text-slate-500">Receipt no. {payment!.id.slice(0, 8).toUpperCase()}</p>
        <dl className="mt-6 space-y-2 text-sm">
          <div className="flex justify-between"><dt className="text-slate-500">Paid by</dt><dd>{viewer.fullName || viewer.email}</dd></div>
          <div className="flex justify-between"><dt className="text-slate-500">Date</dt><dd>{payment!.succeeded_at ? formatDateTime(payment!.succeeded_at, viewer.timezone) : "—"}</dd></div>
          <div className="flex justify-between"><dt className="text-slate-500">Appointment</dt><dd>{appt.reference}</dd></div>
          <div className="flex justify-between"><dt className="text-slate-500">Doctor</dt><dd>{appt.doctor_profiles ? `${appt.doctor_profiles.title} ${appt.doctor_profiles.display_name}` : "—"}</dd></div>
          <div className="flex justify-between"><dt className="text-slate-500">Consultation</dt><dd>{MODE_LABELS[appt.mode]} · {formatDateTime(appt.start_at, viewer.timezone, { withZone: false })}</dd></div>
          <div className="flex justify-between"><dt className="text-slate-500">Description</dt><dd className="capitalize">{payment!.purpose === "upgrade" ? "Consultation upgrade" : "Consultation fee"}</dd></div>
          <div className="flex justify-between border-t border-slate-200 pt-2 text-base font-semibold"><dt>Total paid</dt><dd>{formatMoney(payment!.amount, payment!.currency)}</dd></div>
          {payment!.amount_refunded > 0 && <div className="flex justify-between text-slate-700"><dt>Refunded</dt><dd>−{formatMoney(payment!.amount_refunded, payment!.currency)}</dd></div>}
          <div className="flex justify-between text-xs text-slate-500"><dt>Provider reference</dt><dd className="font-mono">{payment!.provider_payment_id}</dd></div>
        </dl>
      </Card>
    </>
  );
}
