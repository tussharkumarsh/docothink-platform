import "server-only";
import Stripe from "stripe";
import { serverEnv } from "@/lib/env";

/**
 * Payment provider boundary. The database decides amounts (create_payment_record); providers only
 * collect money and report back. A booking is confirmed solely by the verified webhook, never by a
 * browser redirect.
 */
export type CheckoutRequest = {
  paymentId: string;
  amountMinor: number;
  currency: string;
  description: string;
  customerEmail: string;
  successUrl: string;
  cancelUrl: string;
};

export interface PaymentProvider {
  readonly name: "stripe";
  createCheckout(req: CheckoutRequest): Promise<{ checkoutId: string; url: string }>;
  refund(req: { providerPaymentId: string; amountMinor: number; refundId: string }): Promise<{
    providerRefundId: string;
    status: "succeeded" | "pending" | "failed";
  }>;
}

class StripeProvider implements PaymentProvider {
  readonly name = "stripe" as const;
  private stripe: Stripe;

  constructor(secretKey: string) {
    this.stripe = new Stripe(secretKey);
  }

  async createCheckout(req: CheckoutRequest) {
    const session = await this.stripe.checkout.sessions.create(
      {
        mode: "payment",
        customer_email: req.customerEmail,
        line_items: [
          {
            quantity: 1,
            price_data: {
              currency: req.currency.toLowerCase(),
              unit_amount: req.amountMinor,
              product_data: { name: req.description },
            },
          },
        ],
        // Only opaque ids in metadata: no names, symptoms or other personal data.
        metadata: { payment_id: req.paymentId },
        payment_intent_data: { metadata: { payment_id: req.paymentId } },
        success_url: req.successUrl,
        cancel_url: req.cancelUrl,
        expires_at: Math.floor(Date.now() / 1000) + 30 * 60,
      },
      { idempotencyKey: `checkout:${req.paymentId}` },
    );
    if (!session.url) throw new Error("Stripe did not return a checkout URL");
    return { checkoutId: session.id, url: session.url };
  }

  async refund(req: { providerPaymentId: string; amountMinor: number; refundId: string }) {
    const refund = await this.stripe.refunds.create(
      { payment_intent: req.providerPaymentId, amount: req.amountMinor, metadata: { refund_id: req.refundId } },
      { idempotencyKey: `refund:${req.refundId}` },
    );
    const status = refund.status === "succeeded" ? "succeeded" : refund.status === "failed" || refund.status === "canceled" ? "failed" : "pending";
    return { providerRefundId: refund.id, status } as const;
  }

  constructEvent(body: string, signature: string, secret: string) {
    return this.stripe.webhooks.constructEvent(body, signature, secret);
  }
}

export function getPaymentProvider(): StripeProvider | null {
  const { stripeSecretKey } = serverEnv();
  return stripeSecretKey ? new StripeProvider(stripeSecretKey) : null;
}

export function paymentsConfigured(): boolean {
  const env = serverEnv();
  return Boolean(env.stripeSecretKey && env.stripeWebhookSecret);
}

/** Explicit, development-only payment simulation. Refuses to run in production builds. */
export function devSimulationEnabled(): boolean {
  return process.env.NODE_ENV !== "production" && process.env.PAYMENTS_DEV_SIMULATION === "true";
}
