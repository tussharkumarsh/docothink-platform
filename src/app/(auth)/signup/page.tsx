import type { Metadata } from "next";
import Link from "next/link";
import { SignUpForm } from "@/features/auth/components/auth-forms";

export const metadata: Metadata = { title: "Create an account" };

export default function SignUpPage() {
  return (
    <>
      <h1 className="text-xl font-semibold text-slate-900">Create your patient account</h1>
      <p className="mb-6 mt-1 text-sm text-slate-500">We&apos;ll email you a link to verify your address.</p>
      <SignUpForm role="patient" />
      <p className="mt-6 text-center text-sm text-slate-600">
        Are you a doctor? <Link href="/signup/doctor" className="font-medium text-brand-700 hover:underline">Apply here</Link>
        <br />
        Already registered? <Link href="/login" className="font-medium text-brand-700 hover:underline">Log in</Link>
      </p>
    </>
  );
}
