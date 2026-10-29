import type { Metadata } from "next";
import { connection } from "next/server";
import { Suspense } from "react";
import { ButtonLink, Card, Skeleton } from "@/components/ui";
import { ProsePage } from "@/components/layout/prose-page";
import { createPublicClient } from "@/lib/supabase/admin";
import { isSupabaseConfigured } from "@/lib/env";

export const metadata: Metadata = { title: "Pricing" };

async function CancellationPolicy() {
  await connection();
  const fallback = { full_refund_hours_before: 24, partial_refund_hours_before: 4, partial_refund_percent: 50 };
  let policy = fallback;
  if (isSupabaseConfigured) {
    const { data } = await createPublicClient().from("platform_settings").select("value").eq("key", "cancellation").maybeSingle();
    policy = { ...fallback, ...(data?.value as object) };
  }
  return (
    <ul>
      <li>Cancel {policy.full_refund_hours_before}+ hours before your appointment: full refund.</li>
      <li>
        Cancel {policy.partial_refund_hours_before}–{policy.full_refund_hours_before} hours before: {policy.partial_refund_percent}% refund.
      </li>
      <li>Cancel less than {policy.partial_refund_hours_before} hours before, or miss the appointment: no refund.</li>
      <li>If the doctor cancels or does not join: full refund.</li>
    </ul>
  );
}

export default function PricingPage() {
  return (
    <ProsePage title="Transparent pricing" lead="Each doctor sets their own fee for chat, audio and video consultations. You always see the exact price before you pay.">
      <div className="grid gap-4 sm:grid-cols-3">
        {[
          ["Text chat", "Real-time messaging with the doctor at your booked time."],
          ["Audio call", "A secure voice call in your browser."],
          ["Video call", "Face-to-face consultation for visible symptoms."],
        ].map(([title, body]) => (
          <Card key={title} className="p-5">
            <p className="font-medium text-slate-900">{title}</p>
            <p className="mt-1 text-sm text-slate-600">{body}</p>
          </Card>
        ))}
      </div>
      <h2>What&apos;s included</h2>
      <ul>
        <li>The consultation itself, by your chosen mode</li>
        <li>A digital prescription and consultation notes when clinically appropriate</li>
        <li>Secure storage of your reports and medical history</li>
      </ul>
      <h2>Currency</h2>
      <p>Fees are charged in the doctor&apos;s currency (INR, USD or GBP). Your bank may apply its own conversion rate.</p>
      <h2>Upgrading your consultation</h2>
      <p>You can upgrade a booked chat to audio or video (or audio to video) before it starts. You pay only the difference between the prices that applied when you booked.</p>
      <h2>Cancellation and refunds</h2>
      <Suspense fallback={<Skeleton className="h-24" />}>
        <CancellationPolicy />
      </Suspense>
      <div className="pt-4"><ButtonLink href="/doctors">Browse doctors and fees</ButtonLink></div>
    </ProsePage>
  );
}
