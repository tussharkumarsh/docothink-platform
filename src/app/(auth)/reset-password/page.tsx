import type { Metadata } from "next";
import { ResetPasswordForm } from "@/features/auth/components/auth-forms";

export const metadata: Metadata = { title: "Choose a new password" };

export default function ResetPasswordPage() {
  return (
    <>
      <h1 className="text-xl font-semibold text-slate-900">Choose a new password</h1>
      <p className="mb-6 mt-1 text-sm text-slate-500">Use this page from the link in your email.</p>
      <ResetPasswordForm />
    </>
  );
}
