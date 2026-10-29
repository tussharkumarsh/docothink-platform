import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { getPaymentProvider, testPaymentsEnabled } from "@/lib/payments";

/**
 * Sends pending refund rows to the provider. Idempotent: the provider call uses the refund id as
 * its idempotency key, and complete_refund() ignores refunds that are no longer pending.
 * Runs after cancellations (via after()) and from the cron sweep.
 */
export async function processPendingRefunds(limit = 20): Promise<{ processed: number; skipped: string | null }> {
  const provider = getPaymentProvider();
  const testMode = testPaymentsEnabled();
  if (!provider && !testMode) return { processed: 0, skipped: "payment provider not configured" };
  const db = createAdminClient();
  const { data: refunds } = await db
    .from("refunds")
    .select("id, amount, payment_records(provider, provider_payment_id)")
    .eq("status", "pending")
    .is("provider_refund_id", null)
    .order("created_at")
    .limit(limit);

  let processed = 0;
  for (const r of refunds ?? []) {
    const payment = r.payment_records as unknown as { provider: string; provider_payment_id: string | null } | null;
    if (testMode && payment?.provider === "manual") {
      // Test payments moved no money, so the refund completes immediately and the ledger stays consistent.
      await db.rpc("complete_refund", { p_refund: r.id, p_success: true, p_provider_refund_id: `test_${r.id}`, p_failure: null });
      processed++;
      continue;
    }
    if (!provider || !payment?.provider_payment_id || payment.provider !== "stripe") {
      // e.g. manual payments outside test mode: nothing to refund at a provider; an admin must settle manually.
      continue;
    }
    try {
      const result = await provider.refund({ providerPaymentId: payment.provider_payment_id, amountMinor: r.amount, refundId: r.id });
      if (result.status === "pending") {
        // Webhook (refund.updated / charge.refunded) completes it; record the provider id now.
        await db.from("refunds").update({ provider_refund_id: result.providerRefundId }).eq("id", r.id).eq("status", "pending");
      } else {
        await db.rpc("complete_refund", {
          p_refund: r.id,
          p_success: result.status === "succeeded",
          p_provider_refund_id: result.providerRefundId,
          p_failure: result.status === "failed" ? "Provider declined refund" : null,
        });
      }
      processed++;
    } catch (error) {
      console.error("refund failed", r.id, (error as { code?: string }).code ?? "unknown");
    }
  }
  return { processed, skipped: null };
}
