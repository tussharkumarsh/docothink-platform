"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Suspense, type ReactNode } from "react";
import { cn } from "@/components/ui";

export type NavItem = { href: string; label: string; icon: ReactNode };

function NavList({ items, isActive }: { items: NavItem[]; isActive: (href: string) => boolean }) {
  return (
    <ul className="space-y-0.5">
      {items.map((item) => {
        const active = isActive(item.href);
        return (
          <li key={item.href}>
            <Link
              href={item.href}
              aria-current={active ? "page" : undefined}
              className={cn(
                "flex items-center gap-3 rounded-xl px-3 py-2 text-sm transition-colors",
                active ? "bg-slate-100 font-medium text-slate-900" : "text-slate-600 hover:bg-slate-50 hover:text-slate-900",
              )}
            >
              <span className={cn("[&_svg]:size-4", active ? "text-brand-600" : "text-slate-400")}>{item.icon}</span>
              {item.label}
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

/** A portal's home link (e.g. /patient) matches only exactly; section links also match their sub-pages. */
function ActiveNavList({ items }: { items: NavItem[] }) {
  const pathname = usePathname();
  const isActive = (href: string) =>
    pathname === href || (href.split("/").filter(Boolean).length > 1 && pathname.startsWith(`${href}/`));
  return <NavList items={items} isActive={isActive} />;
}

/**
 * Sidebar links with the current section highlighted. The pathname is unknown while prerendering routes
 * with dynamic params, so the un-highlighted list is the Suspense fallback (see usePathname docs).
 */
export function NavLinks({ items }: { items: NavItem[] }) {
  return (
    <Suspense fallback={<NavList items={items} isActive={() => false} />}>
      <ActiveNavList items={items} />
    </Suspense>
  );
}
