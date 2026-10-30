import { Card, CardHeader, Field, Input, PageHeader, Select, Textarea } from "@/components/ui";
import { createClient } from "@/lib/supabase/server";
import { ActionForm } from "@/components/ui/form-client";
import { requirePermission } from "@/lib/auth/viewer";
import { getPlatformSettings } from "@/features/appointments/settings";
import { saveSettingAction } from "@/features/admin/actions";
import { supportedTimezones } from "@/lib/time/format";
import { paymentsConfigured, testPaymentsEnabled } from "@/lib/payments";
import { serverEnv } from "@/lib/env";

function NumberField({ name, label, value, hint }: { name: string; label: string; value: number; hint?: string }) {
  return <Field label={label} htmlFor={name} hint={hint}><Input id={name} name={name} type="number" defaultValue={value} required /></Field>;
}

export default async function SettingsPage() {
  await requirePermission("settings.manage");
  const supabase = await createClient();
  const [s, { data: extra }] = await Promise.all([
    getPlatformSettings(),
    supabase.from("platform_settings").select("key, value").in("key", ["billing", "tds"]),
  ]);
  const billing = (extra?.find((r) => r.key === "billing")?.value ?? {}) as { company_name?: string; address?: string; gstin?: string; pan?: string; email?: string };
  const tds = (extra?.find((r) => r.key === "tds")?.value ?? {}) as { rate_bps?: number };
  const env = serverEnv();
  return (
    <>
      <PageHeader title="Platform settings" description="Every change is written to the audit log." />
      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader title="Cancellation & refunds" />
          <div className="p-5">
            <ActionForm action={saveSettingAction} submitLabel="Save policy">
              <input type="hidden" name="key" value="cancellation" />
              <NumberField name="full_refund_hours_before" label="Full refund if cancelled at least (hours before)" value={s.cancellation.full_refund_hours_before} />
              <NumberField name="partial_refund_hours_before" label="Partial refund if cancelled at least (hours before)" value={s.cancellation.partial_refund_hours_before} />
              <NumberField name="partial_refund_percent" label="Partial refund (%)" value={s.cancellation.partial_refund_percent} />
            </ActionForm>
          </div>
        </Card>
        <Card>
          <CardHeader title="Consultations" />
          <div className="p-5">
            <ActionForm action={saveSettingAction} submitLabel="Save">
              <input type="hidden" name="key" value="consultation" />
              <NumberField name="join_open_minutes_before" label="Room opens (minutes before start)" value={s.consultation.join_open_minutes_before} />
              <NumberField name="join_close_minutes_after" label="Room closes (minutes after end)" value={s.consultation.join_close_minutes_after} />
              <NumberField name="no_show_grace_minutes" label="No-show grace period (minutes)" value={s.consultation.no_show_grace_minutes} />
            </ActionForm>
          </div>
        </Card>
        <Card>
          <CardHeader title="Booking" />
          <div className="p-5">
            <ActionForm action={saveSettingAction} submitLabel="Save">
              <input type="hidden" name="key" value="booking" />
              <NumberField name="max_horizon_days" label="Maximum booking horizon (days)" value={s.booking.max_horizon_days} hint="Doctors can choose a shorter window." />
              <NumberField name="payment_hold_minutes" label="Slot hold while paying (minutes)" value={s.booking.payment_hold_minutes} />
            </ActionForm>
          </div>
        </Card>
        <Card>
          <CardHeader title="Branding & support" />
          <div className="p-5">
            <ActionForm action={saveSettingAction} submitLabel="Save">
              <input type="hidden" name="key" value="branding" />
              <Field label="Platform name" htmlFor="name"><Input id="name" name="name" defaultValue={s.branding.name} required /></Field>
              <Field label="Support email" htmlFor="support_email"><Input id="support_email" name="support_email" type="email" defaultValue={s.branding.support_email} required /></Field>
              <Field label="Emergency note" htmlFor="emergency_note"><Input id="emergency_note" name="emergency_note" defaultValue={s.branding.emergency_note ?? ""} /></Field>
            </ActionForm>
          </div>
        </Card>
        <Card>
          <CardHeader title="Uploads & display" />
          <div className="space-y-6 p-5">
            <ActionForm action={saveSettingAction} submitLabel="Save upload limit">
              <input type="hidden" name="key" value="uploads" />
              <NumberField name="max_file_mb" label="Maximum report size (MB, up to 25)" value={s.uploads.max_file_mb} />
            </ActionForm>
            <ActionForm action={saveSettingAction} submitLabel="Save display zone">
              <input type="hidden" name="key" value="display" />
              <Field label="Admin display time zone" htmlFor="admin_timezone">
                <Select id="admin_timezone" name="admin_timezone" defaultValue={s.display.admin_timezone}>{supportedTimezones().map((z) => <option key={z}>{z}</option>)}</Select>
              </Field>
            </ActionForm>
          </div>
        </Card>
        <Card>
          <CardHeader title="Invoice billing details" description="Shown as “Bill to” on every doctor settlement invoice." />
          <div className="p-5">
            <ActionForm action={saveSettingAction} submitLabel="Save billing details">
              <input type="hidden" name="key" value="billing" />
              <Field label="Company name" htmlFor="company_name"><Input id="company_name" name="company_name" maxLength={200} defaultValue={billing.company_name ?? ""} /></Field>
              <Field label="Address" htmlFor="address"><Textarea id="address" name="address" rows={3} maxLength={500} defaultValue={billing.address ?? ""} /></Field>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="GSTIN (optional)" htmlFor="billing_gstin"><Input id="billing_gstin" name="gstin" maxLength={15} defaultValue={billing.gstin ?? ""} /></Field>
                <Field label="PAN (optional)" htmlFor="billing_pan"><Input id="billing_pan" name="pan" maxLength={10} defaultValue={billing.pan ?? ""} /></Field>
              </div>
              <Field label="Accounts email (optional)" htmlFor="billing_email"><Input id="billing_email" name="email" type="email" defaultValue={billing.email ?? ""} /></Field>
            </ActionForm>
          </div>
        </Card>
        <Card>
          <CardHeader title="TDS on doctor invoices" description="Withheld from invoices paid to Indian bank accounts (Section 194J). Confirm the rate with your accountant." />
          <div className="p-5">
            <ActionForm action={saveSettingAction} submitLabel="Save TDS rate">
              <input type="hidden" name="key" value="tds" />
              <Field label="Rate (basis points, 1000 = 10%)" htmlFor="rate_bps" hint="Applies to invoices submitted after saving.">
                <Input id="rate_bps" name="rate_bps" type="number" min={0} max={3000} defaultValue={tds.rate_bps ?? 1000} required />
              </Field>
            </ActionForm>
          </div>
        </Card>
        <Card>
          <CardHeader title="Integrations" description="Configured through environment variables, not stored in the database." />
          <dl className="space-y-2 p-5 text-sm">
            <div className="flex justify-between"><dt>Payments</dt><dd>{paymentsConfigured() ? "Stripe" : testPaymentsEnabled() ? "Test mode (no real charges)" : "Not configured"}</dd></div>
            <div className="flex justify-between"><dt>Email provider</dt><dd>{env.emailProvider === "resend" && env.resendApiKey ? "Resend" : "Console (dev, not delivered)"}</dd></div>
            <div className="flex justify-between"><dt>TURN relay</dt><dd>{env.turnUrls.length ? "Configured" : "Not configured (STUN only)"}</dd></div>
            <div className="flex justify-between"><dt>Cron secret</dt><dd>{env.cronSecret ? "Set" : "Missing"}</dd></div>
          </dl>
        </Card>
      </div>
    </>
  );
}
