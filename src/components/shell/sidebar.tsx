"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  Gavel,
  Receipt,
  ChartBar,
  Target,
  Settings,
} from "lucide-react";
import { cn } from "@/lib/utils";

const NAV = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/council", label: "Council", icon: Gavel },
  { href: "/transactions", label: "Transactions", icon: Receipt },
  { href: "/analysis", label: "Analysis", icon: ChartBar },
  { href: "/goals", label: "Goals", icon: Target },
  { href: "/settings", label: "Settings", icon: Settings },
] as const;

export function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="hidden md:flex w-60 shrink-0 flex-col border-r border-sidebar-border bg-sidebar">
      <div className="h-14 flex items-center px-5 border-b border-sidebar-border">
        <Link href="/dashboard" className="flex items-center gap-2 group">
          <div className="size-7 rounded-md bg-primary/15 border border-primary/30 grid place-items-center">
            <span className="text-primary text-sm font-semibold">F</span>
          </div>
          <span className="font-semibold tracking-tight">Fincil</span>
        </Link>
      </div>

      <nav className="flex-1 px-3 py-4 flex flex-col gap-0.5">
        {NAV.map((item) => {
          const active =
            pathname === item.href || pathname.startsWith(`${item.href}/`);
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex items-center gap-3 px-3 py-2 rounded-md text-sm transition-colors",
                active
                  ? "bg-sidebar-accent text-sidebar-accent-foreground"
                  : "text-muted-foreground hover:bg-sidebar-accent/60 hover:text-foreground",
              )}
            >
              <Icon className="size-4" />
              {item.label}
            </Link>
          );
        })}
      </nav>

      <div className="px-5 py-4 border-t border-sidebar-border text-xs text-muted-foreground">
        <p className="leading-relaxed">
          Not financial advice. The Council is a thinking aid, not a fiduciary.
        </p>
      </div>
    </aside>
  );
}
