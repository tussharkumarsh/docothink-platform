import "server-only";
import { createClient } from "@/lib/supabase/server";

export type ConsultationSettings = { join_open_minutes_before: number; join_close_minutes_after: number; no_show_grace_minutes: number };
export type CancellationPolicy = { full_refund_hours_before: number; partial_refund_hours_before: number; partial_refund_percent: number };

export async function getPlatformSettings() {
  const supabase = await createClient();
  const { data } = await supabase.from("platform_settings").select("key, value");
  const map = Object.fromEntries((data ?? []).map((r) => [r.key, r.value]));
  return {
    consultation: { join_open_minutes_before: 10, join_close_minutes_after: 30, no_show_grace_minutes: 15, ...map.consultation } as ConsultationSettings,
    cancellation: { full_refund_hours_before: 24, partial_refund_hours_before: 4, partial_refund_percent: 50, ...map.cancellation } as CancellationPolicy,
    booking: { max_horizon_days: 30, payment_hold_minutes: 15, ...map.booking } as { max_horizon_days: number; payment_hold_minutes: number },
    uploads: { max_file_mb: 10, ...map.uploads } as { max_file_mb: number },
    branding: { name: "Docothink", support_email: "support@docothink.com", ...map.branding } as { name: string; support_email: string; emergency_note?: string },
    display: { admin_timezone: "UTC", ...map.display } as { admin_timezone: string },
  };
}

export function joinWindow(startAt: string, endAt: string, s: ConsultationSettings, now = Date.now()) {
  const opens = Date.parse(startAt) - s.join_open_minutes_before * 60_000;
  const closes = Date.parse(endAt) + s.join_close_minutes_after * 60_000;
  return { opens, closes, open: now >= opens && now <= closes };
}
