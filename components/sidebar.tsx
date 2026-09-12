"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import {
  sidebarNavigationItems,
  type SidebarNavKey,
  type SidebarNavigationItem,
} from "@/lib/sidebar-data";

import { AppIcon } from "./app-icon";

function BrandMark() {
  return (
    <span
      aria-hidden="true"
      className="h-1.5 w-1.5 shrink-0 rounded-[1px] bg-app-accent md:mt-[2px] md:h-[5px] md:w-[5px]"
    />
  );
}

function SidebarItemContent({ item }: { item: SidebarNavigationItem }) {
  return (
    <>
      <span className="shrink-0 md:[&>svg]:h-[14px] md:[&>svg]:w-[14px]">
        <AppIcon name={item.icon} size={14} />
      </span>
      <span className="text-[10px] font-medium md:font-mono md:text-[10px] md:uppercase md:tracking-[0.08em]">
        {item.label}
      </span>
      {item.comingSoon ? (
        <span className="ml-auto font-mono text-[7px] uppercase tracking-[0.08em] text-app-text-dim">
          Soon
        </span>
      ) : null}
    </>
  );
}

export function Sidebar({
  activeCurrent = "page",
  items = sidebarNavigationItems,
  onNavigate,
}: {
  activeCurrent?: "location" | "page";
  items?: readonly SidebarNavigationItem[];
  onNavigate?: (key: SidebarNavKey) => void;
}) {
  const pathname = usePathname() ?? "/";

  return (
    <aside className="border-b border-app-sidebar-border bg-app-sidebar md:fixed md:inset-y-0 md:left-0 md:z-10 md:flex md:w-[232px] md:flex-col md:border-b-0 md:border-r">
      <div className="flex items-center justify-between px-4 py-4 md:block md:px-8 md:pb-0 md:pt-8">
        <div className="flex items-center gap-2 md:items-start md:gap-[7px]">
          <BrandMark />
          <div>
            <p className="font-mono text-[10px] font-bold leading-none tracking-[0.08em] text-app-text-logo md:text-[11px]">
              MHR Dex
            </p>
            <p className="mt-1 font-mono text-[8px] leading-none tracking-[0.14em] text-app-text-muted md:mt-[5px] md:text-[7px] md:tracking-[0.1em]">
              MHR COMPANION APP
            </p>
          </div>
        </div>
      </div>

      <nav className="grid grid-cols-2 gap-1 border-t border-app-sidebar-border px-2 py-2 sm:grid-cols-4 md:mt-[102px] md:block md:border-t-0 md:px-5 md:py-0">
        {items.map((item) => {
          const isActive = item.href === pathname;
          const className = `relative flex min-h-11 items-center justify-center gap-2 rounded-[5px] px-2 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-app-accent md:h-[44px] md:min-h-0 md:justify-start md:rounded-[4px] md:px-[12px] ${
            isActive
              ? "bg-app-surface-active text-app-accent-active before:absolute before:bottom-[3px] before:left-0 before:top-[3px] before:w-[2px] before:bg-app-accent"
              : "text-app-text-nav hover:bg-app-surface-hover hover:text-app-text-hover"
          }`;

          if (item.href) {
            return (
              <Link
                aria-current={isActive ? activeCurrent : undefined}
                className={className}
                href={item.href}
                key={item.key}
                onClick={() => onNavigate?.(item.key)}
              >
                <SidebarItemContent item={item} />
              </Link>
            );
          }

          return (
            <button
              aria-current={isActive ? activeCurrent : undefined}
              aria-label={item.comingSoon ? `${item.label}, coming soon` : item.label}
              className={className}
              disabled={item.comingSoon}
              key={item.key}
              onClick={() => onNavigate?.(item.key)}
              title={item.comingSoon ? `${item.label} coming soon` : undefined}
              type="button"
            >
              <SidebarItemContent item={item} />
            </button>
          );
        })}
      </nav>

      <p className="hidden font-mono text-[8px] tracking-[0.12em] text-app-text-dim md:absolute md:bottom-[50px] md:left-8 md:block md:text-[8px] md:tracking-[0.1em]">
        MHR DEX / 01
      </p>
    </aside>
  );
}
