"use client";

import { useEffect, useState, useTransition } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  BarChart3,
  ChevronsLeft,
  ChevronsRight,
  LineChart,
  LogOut,
  MessageSquare,
  Rows3,
  Sparkles,
  TrendingUp,
  UserRound,
  Users,
} from "lucide-react";
import { ThemeToggle } from "@/components/theme-toggle";

export interface RailUser {
  name: string;
  roleName: string;
}

const STORAGE_KEY = "rail-expanded";

/** Collapsible side rail: icon-only when collapsed, labeled sidebar when expanded.
 *  Menu items are permission-gated — the set comes from the user's role. */
export function AppRail({ user, permissions }: { user: RailUser; permissions: string[] }) {
  const allowed = (p?: string) => !p || permissions.includes(p);
  const pathname = usePathname();
  const router = useRouter();
  const [expanded, setExpanded] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  // Optimistic navigation feedback: the clicked item highlights immediately
  // and a progress bar shows while the next route renders.
  const [pendingHref, setPendingHref] = useState<string | null>(null);
  const [isNavigating, startNavigation] = useTransition();

  useEffect(() => {
    if (!isNavigating) setPendingHref(null);
  }, [isNavigating]);

  // Safety net: a stuck transition can never leave the progress bar on screen.
  useEffect(() => {
    if (!pendingHref) return;
    const timer = setTimeout(() => setPendingHref(null), 8000);
    return () => clearTimeout(timer);
  }, [pendingHref]);

  function navigate(e: React.MouseEvent, href: string) {
    if (e.defaultPrevented || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;
    e.preventDefault();
    if (href === pathname) return;
    setPendingHref(href);
    startNavigation(() => {
      router.push(href);
    });
  }

  useEffect(() => {
    try {
      setExpanded(localStorage.getItem(STORAGE_KEY) === "1");
    } catch {
      /* private mode */
    }
  }, []);

  function toggleExpanded() {
    setExpanded((e) => {
      const next = !e;
      try {
        localStorage.setItem(STORAGE_KEY, next ? "1" : "0");
      } catch {
        /* ignore */
      }
      return next;
    });
  }

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
    router.refresh();
  }

  const items = [
    { href: "/", label: "Overview", icon: BarChart3, permission: "viewDashboard" },
    { href: "/orders", label: "Orders", icon: Rows3, permission: "viewOrders" },
    { href: "/explore", label: "Explore", icon: LineChart, permission: "exploreReports" },
    { href: "/ai-analyst", label: "AI Analyst", icon: MessageSquare, permission: "useAiAnalyst" },
    { href: "/forecasting", label: "Forecasting", icon: TrendingUp, permission: "viewForecasting" },
    { href: "/admin/users", label: "Users & roles", icon: Users, permission: "manageUsers" },
  ].filter((i) => allowed(i.permission));

  return (
    <aside
      className="flex h-full shrink-0 flex-col border-r border-[var(--border)] bg-[var(--card)] py-4 transition-[width] duration-200"
      style={{ width: expanded ? 220 : 76 }}
    >
      {/* Brand + collapse toggle (structural control lives at the top) */}
      <div className={`mb-3 flex items-center gap-2 px-3 ${expanded ? "justify-between" : "flex-col justify-center"}`}>
        <div className="flex items-center gap-2">
          <Link
            href="/"
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-[var(--accent)] to-[#7c5cff] text-white shadow-sm"
            aria-label="Home"
            onClick={(e) => navigate(e, "/")}
          >
            <Sparkles className="h-5 w-5" />
          </Link>
          {expanded && (
            <span className="truncate text-sm font-semibold text-[var(--ink)]">Logistics AI</span>
          )}
        </div>
        <button
          onClick={toggleExpanded}
          aria-label={expanded ? "Collapse sidebar" : "Expand sidebar"}
          title={expanded ? "Collapse" : "Expand"}
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-[var(--ink-muted)] transition-colors hover:bg-[var(--hover-wash)] hover:text-[var(--ink)]"
        >
          {expanded ? <ChevronsLeft className="h-4 w-4" /> : <ChevronsRight className="h-4 w-4" />}
        </button>
      </div>

      <nav className="flex flex-1 flex-col gap-1 px-3" aria-label="Main navigation">
        {items.map((item) => {
          const active = pathname === item.href;
          const pending = pendingHref === item.href;
          const highlighted = active || pending;
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              title={item.label}
              aria-label={item.label}
              aria-current={active ? "page" : undefined}
              onClick={(e) => navigate(e, item.href)}
              className={`flex h-11 items-center rounded-xl transition-colors ${
                expanded ? "justify-start gap-3 px-3" : "justify-center px-0"
              } ${
                highlighted
                  ? "bg-[var(--accent-soft)] text-[var(--accent)]"
                  : "text-[var(--ink-muted)] hover:bg-[var(--hover-wash)] hover:text-[var(--ink)]"
              }`}
            >
              <Icon className="h-5 w-5 shrink-0" />
              {expanded && <span className="truncate text-sm font-medium">{item.label}</span>}
            </Link>
          );
        })}
      </nav>

      <div className="mt-auto flex flex-col items-center gap-2 px-3">
        {/* Preferences live at the bottom near the account */}
        <div className={`flex w-full items-center ${expanded ? "justify-start" : "justify-center"}`}>
          <ThemeToggle />
        </div>

        {/* Avatar + account menu */}
        <div className="relative w-full">
          <button
            onClick={() => setMenuOpen(!menuOpen)}
            aria-label="Account menu"
            aria-expanded={menuOpen}
            className={`flex h-11 w-full items-center rounded-full transition-transform hover:scale-[1.02] ${
              expanded ? "gap-2 px-1.5" : "justify-center px-0"
            }`}
          >
            <span className="relative flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[var(--accent-soft)] text-sm font-semibold text-[var(--accent)]">
              {user.name.charAt(0).toUpperCase()}
              <span className="absolute bottom-0 right-0 h-2.5 w-2.5 rounded-full border-2 border-[var(--card)] bg-[var(--success)]" />
            </span>
            {expanded && <span className="truncate text-left text-sm font-medium text-[var(--ink)]">{user.name}</span>}
          </button>

          {menuOpen && (
            <>
              <div className="fixed inset-0 z-40" onClick={() => setMenuOpen(false)} aria-hidden />
              <div
                className="absolute bottom-0 z-50 mb-1 w-56 overflow-hidden rounded-xl text-left"
                style={{
                  left: expanded ? "calc(100% - 8px)" : "calc(100% + 12px)",
                  background: "var(--card)",
                  border: "1px solid var(--border)",
                  boxShadow: "0 16px 40px rgba(2, 6, 23, 0.18)",
                }}
                role="menu"
              >
                <div className="border-b px-4 py-3" style={{ borderColor: "var(--border)" }}>
                  <p className="truncate text-sm font-semibold text-[var(--ink)]">{user.name}</p>
                  <p className="text-xs" style={{ color: "var(--ink-muted)" }}>
                    {user.roleName}
                  </p>
                </div>
                <Link
                  href="/profile"
                  onClick={() => setMenuOpen(false)}
                  className="flex items-center gap-2 px-4 py-2.5 text-sm transition-colors hover:bg-[var(--accent-soft)]"
                  style={{ color: "var(--ink-2)" }}
                  role="menuitem"
                >
                  <UserRound className="h-4 w-4" /> Profile settings
                </Link>
                <button
                  onClick={logout}
                  className="flex w-full items-center gap-2 px-4 py-2.5 text-left text-sm transition-colors hover:bg-[var(--risk-soft)]"
                  style={{ color: "var(--risk)" }}
                  role="menuitem"
                >
                  <LogOut className="h-4 w-4" /> Log out
                </button>
              </div>
            </>
          )}
        </div>
      </div>

      {pendingHref && (
        <div
          className="nav-progress"
          role="status"
          aria-label="Loading page"
          style={{ position: "fixed", left: 0, top: 0, height: 3, width: "100%", zIndex: 100, background: "var(--hover-wash)" }}
        >
          <div className="nav-progress-bar" style={{ background: "var(--accent)" }} />
        </div>
      )}
    </aside>
  );
}
