"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

type NavItem = { href: string; label: string; match?: (p: string) => boolean };

export default function AppShell({
  email,
  isAdmin,
  isSignedIn,
  children,
}: {
  email: string | null;
  isAdmin: boolean;
  isSignedIn: boolean;
  children: React.ReactNode;
}) {
  const pathname = usePathname() || "/";
  const [navOpen, setNavOpen] = useState(false);
  const [clock, setClock] = useState("--:--:--");

  // live clock
  useEffect(() => {
    const pad = (n: number) => String(n).padStart(2, "0");
    const tick = () => {
      const d = new Date();
      setClock(`${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`);
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, []);

  // close the mobile drawer whenever the route changes
  useEffect(() => setNavOpen(false), [pathname]);

  const main: NavItem[] = [
    { href: "/", label: "Home", match: (p) => p === "/" },
    { href: "/companies", label: "Companies", match: (p) => p.startsWith("/companies") },
    { href: "/announcements", label: "Announcements" },
    { href: "/search", label: "Check shortlist" },
  ];
  if (isSignedIn) {
    main.push({ href: "/dashboard", label: "Dashboard" });
    main.push({ href: "/report-issue", label: "Report an issue" });
  }
  const admin: NavItem[] = [
    { href: "/admin", label: "Console", match: (p) => p === "/admin" },
    { href: "/admin/manage-admins", label: "Manage admins" },
    { href: "/admin/manual-ingest", label: "Manual ingest" },
  ];

  const isActive = (item: NavItem) => (item.match ? item.match(pathname) : pathname === item.href);

  const renderNav = (items: NavItem[]) =>
    items.map((item) => (
      <Link key={item.href} href={item.href} className="navlink" aria-current={isActive(item) ? "page" : undefined}>
        <span className="stn" aria-hidden="true" />
        <span>{item.label}</span>
      </Link>
    ));

  return (
    <div className={`shell${navOpen ? " nav-open" : ""}`}>
      <div className="scrim" aria-hidden="true" onClick={() => setNavOpen(false)} />

      <aside className="rail">
        <Link href="/" className="brand">
          <span className="glyph" aria-hidden="true">
            <i />
            <i />
            <i />
            <i />
          </span>
          <span>
            <b>Placement Board</b>
            <small>vitstudent.ac.in</small>
          </span>
        </Link>

        <nav aria-label="Primary">
          <div className="navgroup">Tracking</div>
          <div className="nav">{renderNav(main)}</div>
          {isAdmin && (
            <>
              <div className="navgroup">Admin</div>
              <div className="nav">{renderNav(admin)}</div>
            </>
          )}
        </nav>

        <div className="railfoot">
          <span className="clock">
            <span className="d" aria-hidden="true" />
            <time>{clock}</time>
          </span>
          <ThemeToggle />
        </div>
        <div className="railfoot" style={{ borderTop: "none", paddingTop: 0, marginTop: 8 }}>
          <span className="who" title={email ?? undefined}>{email ?? "Not signed in"}</span>
          <a
            className="themebtn"
            style={{ marginLeft: "auto" }}
            href={isSignedIn ? "/api/auth/signout" : "/api/auth/signin"}
          >
            {isSignedIn ? "SIGN OUT" : "SIGN IN"}
          </a>
        </div>
      </aside>

      <div className="mainwrap">
        <div className="mtop">
          <span className="glyph" aria-hidden="true">
            <i />
            <i />
            <i />
            <i />
          </span>
          <b>Placement Board</b>
          <button
            className="menubtn"
            type="button"
            aria-expanded={navOpen}
            onClick={() => setNavOpen((v) => !v)}
          >
            MENU
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

function ThemeToggle() {
  const [theme, setTheme] = useState<"light" | "dark" | null>(null);

  useEffect(() => {
    const stored = (localStorage.getItem("pb-theme") as "light" | "dark" | null) ?? null;
    if (stored) {
      document.documentElement.setAttribute("data-theme", stored);
      setTheme(stored);
    }
  }, []);

  const toggle = () => {
    const current =
      document.documentElement.getAttribute("data-theme") ??
      (window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");
    const next = current === "dark" ? "light" : "dark";
    document.documentElement.setAttribute("data-theme", next);
    localStorage.setItem("pb-theme", next);
    setTheme(next);
  };

  return (
    <button className="themebtn" style={{ marginLeft: "auto" }} type="button" onClick={toggle} aria-label="Switch theme">
      {theme === "dark" ? "LIGHT" : theme === "light" ? "DARK" : "THEME"}
    </button>
  );
}
