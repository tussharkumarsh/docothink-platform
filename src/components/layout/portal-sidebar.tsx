"use client";

import { useState, type ReactNode } from "react";
import { PanelLeftClose, PanelLeftOpen } from "lucide-react";
import { cn } from "@/components/ui";
import { NavLinks, type NavItem } from "./portal-nav";
import { SIDEBAR_COOKIE } from "./sidebar-cookie";

/**
 * Desktop sidebar: full (w-60) or an icon-only rail (w-16). The choice is kept in a cookie so the
 * server renders the right width on the next page load (no flash of the wrong layout).
 */
export function PortalSidebar(props: {
  label: string;
  nav: NavItem[];
  logo: ReactNode;
  logoCompact: ReactNode;
  initialCollapsed: boolean;
}) {
  const [collapsed, setCollapsed] = useState(props.initialCollapsed);
  const toggle = () => {
    const next = !collapsed;
    setCollapsed(next);
    document.cookie = `${SIDEBAR_COOKIE}=${next ? "collapsed" : "expanded"}; path=/; max-age=31536000; samesite=lax`;
  };
  const ToggleIcon = collapsed ? PanelLeftOpen : PanelLeftClose;

  return (
    <aside
      className={cn(
        "sticky top-0 hidden h-screen shrink-0 flex-col border-r border-black/6 bg-white/70 transition-[width] duration-200 lg:flex no-print",
        collapsed ? "w-16" : "w-60",
      )}
    >
      <div className={cn("flex h-14 items-center", collapsed ? "justify-center" : "justify-between px-4")}>
        {collapsed ? props.logoCompact : props.logo}
      </div>
      {!collapsed && <p className="px-5 pb-2 pt-2 text-xs font-semibold text-slate-400">{props.label}</p>}
      <nav aria-label={`${props.label} navigation`} className={cn("flex-1 overflow-y-auto", collapsed ? "px-2 pt-2" : "px-3")}>
        <NavLinks items={props.nav} compact={collapsed} />
      </nav>
      <div className={cn("border-t border-black/6 p-2", collapsed ? "flex justify-center" : "")}>
        <button
          type="button"
          onClick={toggle}
          aria-expanded={!collapsed}
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          className={cn(
            "flex items-center gap-2 rounded-xl py-2 text-sm text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-900",
            collapsed ? "justify-center px-2" : "w-full px-3",
          )}
        >
          <ToggleIcon className="size-4" aria-hidden />
          {!collapsed && "Collapse"}
        </button>
      </div>
    </aside>
  );
}
