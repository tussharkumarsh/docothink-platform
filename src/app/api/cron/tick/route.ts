import { NextResponse, type NextRequest } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { serverEnv } from "@/lib/env";
import { createAdminClient } from "@/lib/supabase/admin";
import { processOutbox } from "@/lib/email/outbox";
import { processPendingRefunds } from "@/features/payments/server";

/**
 * Background tick: expire payment holds, settle no-shows, close forgotten sessions, queue reminders,
 * send emails, push pending refunds. Safe to run concurrently and repeatedly (all steps idempotent).
 * Triggered every minute by Supabase pg_cron + pg_net (see docs/04-deployment.md), with a daily
 * Vercel Cron as a fallback. Authenticated by `Authorization: Bearer $CRON_SECRET`.
 */
function authorised(request: NextRequest): boolean {
  const secret = serverEnv().cronSecret;
  const header = request.headers.get("authorization") ?? "";
  if (!secret) return false;
  const expected = Buffer.from(`Bearer ${secret}`);
  const actual = Buffer.from(header);
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

async function run(request: NextRequest) {
  if (!authorised(request)) return NextResponse.json({ error: "unauthorised" }, { status: 401 });
  const db = createAdminClient();
  const [sweep, reminders] = await Promise.all([db.rpc("sweep_appointments"), db.rpc("enqueue_due_reminders")]);
  const [email, refunds] = await Promise.all([processOutbox(50), processPendingRefunds(20)]);
  return NextResponse.json({ sweep: sweep.data, reminders: reminders.data, email, refunds });
}

export const GET = run;
export const POST = run;
