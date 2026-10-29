import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { Alert, Skeleton } from "@/components/ui";
import { LoginForm, MagicLinkForm } from "@/features/auth/components/auth-forms";

export const metadata: Metadata = { title: "Log in" };

async function LoginContent({ searchParams }: { searchParams: PageProps<"/login">["searchParams"] }) {
  const params = await searchParams;
  const next = typeof params.next === "string" ? params.next : undefined;
  return (
    <>
      {params.error === "link_expired" && (
        <Alert tone="warning" className="mb-4">That link has expired or was already used. Request a new one below.</Alert>
      )}
      <LoginForm next={next} />
      <div className="my-6 flex items-center gap-3 text-xs text-slate-400">
        <span className="h-px flex-1 bg-slate-200" /> or <span className="h-px flex-1 bg-slate-200" />
      </div>
      <MagicLinkForm next={next} />
    </>
  );
}

export default function LoginPage({ searchParams }: PageProps<"/login">) {
  return (
    <>
      <h1 className="text-xl font-semibold text-slate-900">Welcome back</h1>
      <p className="mb-6 mt-1 text-sm text-slate-500">Patients, doctors and administrators sign in here.</p>
      <Suspense fallback={<Skeleton className="h-64" />}>
        <LoginContent searchParams={searchParams} />
      </Suspense>
      <p className="mt-6 text-center text-sm text-slate-600">
        New here? <Link href="/signup" className="font-medium text-brand-700 hover:underline">Create an account</Link>
      </p>
    </>
  );
}
