"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { cls } from "@/lib/format";

const TABS = [
  { href: "/", label: "Today" },
  { href: "/dfs", label: "DFS" },
  { href: "/tracker", label: "Tracker" },
  { href: "/extras", label: "Extras" },
  { href: "/sources", label: "Sources" },
];

export function TopBar() {
  const pathname = usePathname();
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [spinning, setSpinning] = useState(false);

  function refresh() {
    setSpinning(true);
    startTransition(() => router.refresh());
    setTimeout(() => setSpinning(false), 700);
  }

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
    router.refresh();
  }

  if (pathname === "/login") return null;

  return (
    <header className="topbar">
      <div className="topbar-inner">
        <span className="brand">
          <span className="dot" />
          Bet Hub
        </span>
        <span className="spacer" />
        <ThemeToggle />
        <button className={cls("iconbtn", (pending || spinning) && "busy")} onClick={refresh} aria-label="Refresh">
          <RefreshIcon spinning={pending || spinning} />
          Refresh
        </button>
        <button className="iconbtn" onClick={logout} aria-label="Sign out" title="Sign out" style={{ padding: "0 10px" }}>
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
            <path d="M16 17l5-5-5-5M21 12H9" />
          </svg>
        </button>
      </div>
      <div className="topbar-inner" style={{ paddingTop: 0, paddingBottom: 6 }}>
        <nav className="tabs">
          {TABS.map((t) => {
            const active = t.href === "/" ? pathname === "/" : pathname.startsWith(t.href);
            return (
              <Link key={t.href} href={t.href} className={cls("tab", active && "active")}>
                {t.label}
              </Link>
            );
          })}
          {/* /simulator is a raw-HTML route (owner-gated), so use a full-navigation anchor. */}
          <a href="/simulator" className="tab">Sim</a>
        </nav>
      </div>
    </header>
  );
}

function ThemeToggle() {
  const [theme, setTheme] = useState<"light" | "dark" | null>(null);
  useEffect(() => {
    const stored = (localStorage.getItem("theme") as "light" | "dark" | null) ?? null;
    setTheme(stored);
  }, []);
  function toggle() {
    const current = document.documentElement.getAttribute("data-theme");
    const isDark = current ? current === "dark" : window.matchMedia("(prefers-color-scheme: dark)").matches;
    const next = isDark ? "light" : "dark";
    document.documentElement.setAttribute("data-theme", next);
    localStorage.setItem("theme", next);
    setTheme(next);
  }
  const isDark = theme === "dark";
  return (
    <button className="iconbtn" onClick={toggle} aria-label="Toggle theme" title="Toggle theme" style={{ padding: "0 10px" }}>
      {isDark ? (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="4" />
          <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M6.3 17.7l-1.4 1.4M19.1 4.9l-1.4 1.4" />
        </svg>
      ) : (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z" />
        </svg>
      )}
    </button>
  );
}

function RefreshIcon({ spinning }: { spinning: boolean }) {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" style={spinning ? { animation: "spin 0.7s linear infinite" } : undefined}>
      <path d="M21 12a9 9 0 1 1-2.64-6.36" />
      <path d="M21 3v6h-6" />
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </svg>
  );
}
