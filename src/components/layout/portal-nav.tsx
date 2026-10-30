"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Suspense, type ReactNode } from "react";
import { cn } from "@/components/ui";

export type NavItem = { href: string; label: string; icon: ReactNode };

function NavList({ items, isActive, compact }: { items: NavItem[]; isActive: (href: string) => boolean; compact?: boolean }) {
  return (
    <ul className="space-y-0.5">
      {items.map((item) => {
        const active = isActive(item.href);
        return (
          <li key={item.href}>
            <Link
              href={item.href}
              aria-current={active ? "page" : undefined}
              title={compact ? item.label : undefined}
              className={cn(
                "flex items-center rounded-xl py-2 text-sm transition-colors",
                compact ? "justify-center px-0" : "gap-3 px-3",
                active ? "bg-slate-100 font-medium text-slate-900" : "text-slate-600 hover:bg-slate-50 hover:text-slate-900",
              )}
            >
              <span className={cn(compact ? "[&_svg]:size-5" : "[&_svg]:size-4", active ? "text-brand-600" : "text-slate-400")}>{item.icon}</span>
              <span className={compact ? "sr-only" : undefined}>{item.label}</span>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

/** A portal's home link (e.g. /patient) matches only exactly; section links also match their sub-pages. */
function ActiveNavList({ items, compact }: { items: NavItem[]; compact?: boolean }) {
  const pathname = usePathname();
  const isActive = (href: string) =>
    pathname === href || (href.split("/").filter(Boolean).length > 1 && pathname.startsWith(`${href}/`));
  return <NavList items={items} isActive={isActive} compact={compact} />;
}

/**
 * Sidebar links with the current section highlighted; `compact` renders the icon-only rail (labels stay
 * available to screen readers and as tooltips). The pathname is unknown while prerendering routes with
 * dynamic params, so the un-highlighted list is the Suspense fallback (see usePathname docs).
 */
export function NavLinks({ items, compact }: { items: NavItem[]; compact?: boolean }) {
  return (
    <Suspense fallback={<NavList items={items} isActive={() => false} compact={compact} />}>
      <ActiveNavList items={items} compact={compact} />
    </Suspense>
  );
}
