import Link from "next/link";
import { Suspense, type ReactNode } from "react";
import { Bell, LogOut, Menu } from "lucide-react";
import { Logo } from "./site-chrome";
import { getViewer } from "@/lib/auth/viewer";
import { createClient } from "@/lib/supabase/server";
import { signOutAction } from "@/features/auth/actions";

export type NavItem = { href: string; label: string; icon: ReactNode };

async function UserMenu({ notificationsHref }: { notificationsHref: string }) {
  const viewer = await getViewer();
  if (!viewer) return null;
  const supabase = await createClient();
  const { count } = await supabase
    .from("notifications")
    .select("id", { count: "exact", head: true })
    .eq("user_id", viewer.id)
    .is("read_at", null);
  return (
    <div className="flex items-center gap-3">
      <Link href={notificationsHref} className="relative rounded-md p-2 text-slate-600 hover:bg-slate-100" aria-label={`Notifications${count ? ` (${count} unread)` : ""}`}>
        <Bell className="size-5" aria-hidden />
        {!!count && <span className="absolute right-1 top-1 flex size-4 items-center justify-center rounded-full bg-red-600 text-[10px] font-semibold text-white">{count > 9 ? "9+" : count}</span>}
      </Link>
      <div className="hidden text-right sm:block">
        <p className="text-sm font-medium text-slate-900">{viewer.fullName || viewer.email}</p>
        <p className="text-xs text-slate-500">{viewer.timezone}</p>
      </div>
      <form action={signOutAction}>
        <button type="submit" className="rounded-md p-2 text-slate-600 hover:bg-slate-100" aria-label="Sign out">
          <LogOut className="size-5" aria-hidden />
        </button>
      </form>
    </div>
  );
}

function NavLinks({ items }: { items: NavItem[] }) {
  return (
    <ul className="space-y-1">
      {items.map((item) => (
        <li key={item.href}>
          <Link href={item.href} className="flex items-center gap-3 rounded-lg px-3 py-2 text-sm text-slate-700 hover:bg-slate-100 hover:text-slate-900">
            <span className="text-slate-400 [&_svg]:size-4">{item.icon}</span>
            {item.label}
          </Link>
        </li>
      ))}
    </ul>
  );
}

export function PortalShell({ label, nav, notificationsHref, children }: { label: string; nav: NavItem[]; notificationsHref: string; children: ReactNode }) {
  return (
    <div className="flex min-h-screen bg-slate-50">
      <aside className="hidden w-64 shrink-0 border-r border-slate-200 bg-white lg:block no-print">
        <div className="flex h-16 items-center border-b border-slate-100 px-5"><Logo /></div>
        <p className="px-5 pb-2 pt-5 text-xs font-medium uppercase tracking-wide text-slate-400">{label}</p>
        <nav aria-label={`${label} navigation`} className="px-3">
          <NavLinks items={nav} />
        </nav>
      </aside>
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-20 flex h-16 items-center justify-between gap-3 border-b border-slate-200 bg-white px-4 sm:px-6 no-print">
          <details className="relative lg:hidden">
            <summary className="flex size-9 cursor-pointer list-none items-center justify-center rounded-md hover:bg-slate-100" aria-label="Open navigation">
              <Menu className="size-5" aria-hidden />
            </summary>
            <nav aria-label={`${label} navigation`} className="absolute left-0 mt-2 w-64 rounded-lg border border-slate-200 bg-white p-2 shadow-lg">
              <NavLinks items={nav} />
            </nav>
          </details>
          <span className="text-sm font-medium text-slate-500 lg:hidden">{label}</span>
          <div className="ml-auto">
            <Suspense fallback={<div className="h-9 w-40" />}>
              <UserMenu notificationsHref={notificationsHref} />
            </Suspense>
          </div>
        </header>
        <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-8 sm:px-6">{children}</main>
      </div>
    </div>
  );
}
