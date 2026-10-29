import type { Metadata } from "next";
import Link from "next/link";
import { SignUpForm } from "@/features/auth/components/auth-forms";

export const metadata: Metadata = { title: "Doctor application" };

export default function DoctorSignUpPage() {
  return (
    <>
      <h1 className="text-xl font-semibold text-slate-900">Apply as a doctor</h1>
      <p className="mb-6 mt-1 text-sm text-slate-500">
        Create your account first. After verifying your email you&apos;ll add your professional details and documents.
      </p>
      <SignUpForm role="doctor" />
      <p className="mt-6 text-center text-sm text-slate-600">
        Already applied? <Link href="/login" className="font-medium text-brand-700 hover:underline">Log in</Link>
      </p>
    </>
  );
}
