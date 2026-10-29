import { signOutAction } from "@/features/auth/actions";
import { Button } from "@/components/ui";

export default function AccountDisabledPage() {
  return (
    <>
      <h1 className="text-xl font-semibold text-slate-900">Account unavailable</h1>
      <p className="mt-2 text-sm text-slate-600">
        This account has been deactivated. If you think this is a mistake, contact support from the Contact page.
      </p>
      <form action={signOutAction} className="mt-6">
        <Button type="submit" variant="secondary">Sign out</Button>
      </form>
    </>
  );
}
