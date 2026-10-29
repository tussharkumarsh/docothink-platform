import { NextResponse, after, type NextRequest } from "next/server";
import { processOutbox } from "@/lib/email/outbox";
import type Stripe from "stripe";
import { getPaymentProvider } from "@/lib/payments";
import { serverEnv } from "@/lib/env";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Stripe webhook: the only path that confirms payments. Signature-verified, de-duplicated by
 * event id, and every handler is idempotent in the database as well.
 */
export async function POST(request: NextRequest) {
  const provider = getPaymentProvider();
  const secret = serverEnv().stripeWebhookSecret;
  if (!provider || !secret) return NextResponse.json({ error: "payments not configured" }, { status: 503 });

  const signature = request.headers.get("stripe-signature");
  if (!signature) return NextResponse.json({ error: "missing signature" }, { status: 400 });

  let event: Stripe.Event;
  try {
    event = provider.constructEvent(await request.text(), signature, secret);
  } catch {
    return NextResponse.json({ error: "invalid signature" }, { status: 400 });
  }

  const db = createAdminClient();
  const { error: dupError } = await db
    .from("payment_webhook_events")
    .insert({ provider: "stripe", event_id: event.id, event_type: event.type });
  if (dupError) {
    // 23505 = already received. Acknowledge so Stripe stops retrying.
    if (dupError.code === "23505") return NextResponse.json({ received: true, duplicate: true });
    return NextResponse.json({ error: "storage error" }, { status: 500 });
  }

  try {
    switch (event.type) {
      case "checkout.session.completed":
      case "checkout.session.async_payment_succeeded": {
        const session = event.data.object as Stripe.Checkout.Session;
        const paymentId = session.metadata?.payment_id;
        if (paymentId && session.payment_status === "paid" && session.amount_total != null && session.currency) {
          const { error } = await db.rpc("confirm_payment", {
            p_payment: paymentId,
            p_provider_payment_id: typeof session.payment_intent === "string" ? session.payment_intent : session.payment_intent?.id ?? session.id,
            p_amount: session.amount_total,
            p_currency: session.currency,
          });
          if (error) throw error;
        }
        break;
      }
      case "checkout.session.expired":
      case "checkout.session.async_payment_failed": {
        const session = event.data.object as Stripe.Checkout.Session;
        if (session.metadata?.payment_id) {
          await db.rpc("fail_payment", { p_payment: session.metadata.payment_id, p_reason: event.type });
        }
        break;
      }
      case "refund.updated":
      case "refund.created": {
        const refund = event.data.object as Stripe.Refund;
        const refundId = refund.metadata?.refund_id;
        if (refundId && (refund.status === "succeeded" || refund.status === "failed" || refund.status === "canceled")) {
          await db.rpc("complete_refund", {
            p_refund: refundId,
            p_success: refund.status === "succeeded",
            p_provider_refund_id: refund.id,
            p_failure: refund.status === "succeeded" ? null : (refund.failure_reason ?? refund.status),
          });
        }
        break;
      }
      default:
        break;
    }
    await db.from("payment_webhook_events").update({ processed_at: new Date().toISOString() }).eq("provider", "stripe").eq("event_id", event.id);
    after(() => processOutbox(10).catch(() => undefined));
    return NextResponse.json({ received: true });
  } catch (error) {
    // Allow Stripe to retry: forget the event so the retry is processed.
    await db.from("payment_webhook_events").delete().eq("provider", "stripe").eq("event_id", event.id);
    console.error("stripe webhook handler failed", event.type, (error as { code?: string }).code ?? "error");
    return NextResponse.json({ error: "handler failed" }, { status: 500 });
  }
}
