"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState, useSyncExternalStore } from "react";
import { nextTheme, resolveTheme, THEME_EVENT, THEME_KEY, type Theme } from "./theme";

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

  // Close the mobile drawer whenever the route changes. Adjusted during render
  // rather than in an effect so the drawer is already gone in the same commit
  // as the new page — an effect left it visible for one painted frame.
  const [drawerPathname, setDrawerPathname] = useState(pathname);
  if (pathname !== drawerPathname) {
    setDrawerPathname(pathname);
    setNavOpen(false);
  }

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
    { href: "/admin/retention", label: "Retention" },
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
            <b>Placement Tracker</b>
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
          <b>Placement Tracker</b>
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

// Defined at module scope so the reference stays stable across renders —
// useSyncExternalStore resubscribes whenever `subscribe` changes identity.
function subscribeToTheme(onChange: () => void): () => void {
  const media = window.matchMedia("(prefers-color-scheme: dark)");
  window.addEventListener("storage", onChange);
  window.addEventListener(THEME_EVENT, onChange);
  media.addEventListener("change", onChange);
  return () => {
    window.removeEventListener("storage", onChange);
    window.removeEventListener(THEME_EVENT, onChange);
    media.removeEventListener("change", onChange);
  };
}

// Returns a string, so repeated calls compare equal by value and can't spin
// useSyncExternalStore into a re-render loop.
function getThemeSnapshot(): Theme {
  return resolveTheme(
    document.documentElement.getAttribute("data-theme"),
    window.matchMedia("(prefers-color-scheme: dark)").matches
  );
}

// The server can't know a visitor's theme, so it renders a neutral label that
// is identical on both sides of hydration. The inline boot script in the
// document head has already applied the correct colours by this point — only
// the button's caption settles a moment later.
function getServerThemeSnapshot(): Theme | null {
  return null;
}

/**
 * Reads the theme straight from the DOM attribute rather than mirroring it into
 * React state. The attribute is the source of truth: the boot script sets it
 * before first paint, and this component only has to stay in step with it.
 */
function ThemeToggle() {
  const theme = useSyncExternalStore(subscribeToTheme, getThemeSnapshot, getServerThemeSnapshot);

  const toggle = () => {
    const next = nextTheme(getThemeSnapshot());
    document.documentElement.setAttribute("data-theme", next);
    try {
      localStorage.setItem(THEME_KEY, next);
    } catch {
      // Private-browsing modes reject writes; the theme still applies for this
      // page view, it just won't be remembered.
    }
    // `storage` doesn't fire in the tab that wrote it, so announce it here.
    window.dispatchEvent(new Event(THEME_EVENT));
  };

  return (
    <button className="themebtn" style={{ marginLeft: "auto" }} type="button" onClick={toggle} aria-label="Switch theme">
      {theme === "dark" ? "LIGHT" : theme === "light" ? "DARK" : "THEME"}
    </button>
  );
}
