import Link from "next/link";
import { Suspense, type ReactNode } from "react";
import { Bell, LogOut, Menu } from "lucide-react";
import { Logo } from "./site-chrome";
import { cookies } from "next/headers";
import { NavLinks, type NavItem } from "./portal-nav";
import { PortalSidebar } from "./portal-sidebar";
import { SIDEBAR_COOKIE } from "./sidebar-cookie";
import { DemoNotice } from "./demo-notice";
import { getViewer } from "@/lib/auth/viewer";
import { createClient } from "@/lib/supabase/server";
import { signOutAction } from "@/features/auth/actions";

export type { NavItem };

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
    <div className="flex items-center gap-2">
      <Link href={notificationsHref} className="relative rounded-full p-2 text-slate-600 transition-colors hover:bg-black/5" aria-label={`Notifications${count ? ` (${count} unread)` : ""}`}>
        <Bell className="size-5" aria-hidden />
        {!!count && <span className="absolute right-1 top-1 flex size-4 items-center justify-center rounded-full bg-red-500 text-[10px] font-semibold text-white">{count > 9 ? "9+" : count}</span>}
      </Link>
      <div className="hidden px-1 text-right sm:block">
        <p className="text-[13px] font-medium text-slate-900">{viewer.fullName || viewer.email}</p>
        <p className="text-xs text-slate-500">{viewer.timezone}</p>
      </div>
      <form action={signOutAction}>
        <button type="submit" className="rounded-full p-2 text-slate-600 transition-colors hover:bg-black/5" aria-label="Sign out">
          <LogOut className="size-5" aria-hidden />
        </button>
      </form>
    </div>
  );
}

/** Reads the remembered collapsed/expanded choice; streamed behind Suspense because cookies are request data. */
async function Sidebar({ label, nav }: { label: string; nav: NavItem[] }) {
  const collapsed = (await cookies()).get(SIDEBAR_COOKIE)?.value === "collapsed";
  return <PortalSidebar label={label} nav={nav} logo={<Logo />} logoCompact={<Logo compact />} initialCollapsed={collapsed} />;
}

export function PortalShell({ label, nav, notificationsHref, children }: { label: string; nav: NavItem[]; notificationsHref: string; children: ReactNode }) {
  return (
    <div className="flex min-h-screen bg-slate-50">
      <Suspense fallback={<PortalSidebar label={label} nav={nav} logo={<Logo />} logoCompact={<Logo compact />} initialCollapsed={false} />}>
        <Sidebar label={label} nav={nav} />
      </Suspense>
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="glass sticky top-0 z-20 flex h-14 items-center justify-between gap-3 border-b border-black/6 px-4 sm:px-6 no-print">
          <details className="relative lg:hidden">
            <summary className="flex size-9 cursor-pointer list-none items-center justify-center rounded-full hover:bg-black/5" aria-label="Open navigation">
              <Menu className="size-5" aria-hidden />
            </summary>
            <nav aria-label={`${label} navigation`} className="glass absolute left-0 mt-2 w-64 rounded-2xl p-2 shadow-card ring-1 ring-black/6">
              <NavLinks items={nav} />
            </nav>
          </details>
          <span className="text-[15px] font-semibold text-slate-900 lg:hidden">{label}</span>
          <div className="ml-auto">
            <Suspense fallback={<div className="h-9 w-40" />}>
              <UserMenu notificationsHref={notificationsHref} />
            </Suspense>
          </div>
        </header>
        <Suspense fallback={null}>
          <DemoNotice />
        </Suspense>
        <main className="w-full min-w-0 flex-1 px-4 py-6 sm:px-6">{children}</main>
      </div>
    </div>
  );
}
