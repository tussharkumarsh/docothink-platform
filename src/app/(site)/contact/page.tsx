import type { Metadata } from "next";
import { Suspense } from "react";
import { connection } from "next/server";
import { Mail, PhoneCall } from "lucide-react";
import { Card, Skeleton } from "@/components/ui";
import { createPublicClient } from "@/lib/supabase/admin";
import { isSupabaseConfigured } from "@/lib/env";

export const metadata: Metadata = { title: "Contact us" };

async function SupportEmail() {
  await connection();
  let email = "support@docothink.com";
  if (isSupabaseConfigured) {
    const { data } = await createPublicClient().from("platform_settings").select("value").eq("key", "branding").maybeSingle();
    email = (data?.value as { support_email?: string } | null)?.support_email ?? email;
  }
  return (
    <a href={`mailto:${email}`} className="font-medium text-brand-700 hover:underline">
      {email}
    </a>
  );
}

export default function ContactPage() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-12 sm:px-6">
      <h1 className="text-3xl font-semibold tracking-tight text-slate-900">Contact us</h1>
      <p className="mt-2 text-slate-600">For help with bookings, payments or your account.</p>
      <div className="mt-8 grid gap-4 sm:grid-cols-2">
        <Card className="p-5">
          <Mail className="size-5 text-brand-600" aria-hidden />
          <p className="mt-3 font-medium text-slate-900">Email support</p>
          <p className="mt-1 text-sm text-slate-600">
            <Suspense fallback={<Skeleton className="h-5 w-40" />}>
              <SupportEmail />
            </Suspense>
          </p>
          <p className="mt-2 text-xs text-slate-500">
            Please don&apos;t email medical reports or detailed symptoms; upload them securely in your account instead.
          </p>
        </Card>
        <Card className="border-red-200 bg-red-50 p-5">
          <PhoneCall className="size-5 text-red-700" aria-hidden />
          <p className="mt-3 font-medium text-red-900">Medical emergency?</p>
          <p className="mt-1 text-sm text-red-900">Call 911 (US), 999 (UK) or 112 (India) immediately. Docothink is not an emergency service.</p>
        </Card>
      </div>
    </div>
  );
}
