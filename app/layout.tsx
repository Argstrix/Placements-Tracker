import type { Metadata } from "next";
import { SpeedInsights } from "@vercel/speed-insights/next";
import { getServerSession } from "next-auth";
import { buildAuthOptions } from "@/auth/authOptions";
import { isAuthorized } from "@/auth/isAuthorized";
import { prisma } from "@/db/client";
import AppShell from "./components/AppShell";
import SiteFooter from "./components/SiteFooter";
import { THEME_BOOT_SCRIPT } from "./components/theme";
import "./globals.css";

export const metadata: Metadata = {
  title: "Placement Tracker — VIT placement tracker",
  description: "Unofficial VIT placement mail tracker",
  robots: { index: false, follow: false },
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const session = await getServerSession(buildAuthOptions());
  const email = session?.user?.email ?? null;
  const role = email ? (await isAuthorized(email, prisma)).role : null;

  return (
    // suppressHydrationWarning: the boot script below sets data-theme on this
    // element before React hydrates, so the server and client markup differ here
    // by design.
    <html lang="en" className="antialiased" suppressHydrationWarning>
      <head>
        {/* Runs before first paint so a saved dark theme never flashes light. */}
        <script dangerouslySetInnerHTML={{ __html: THEME_BOOT_SCRIPT }} />
      </head>
      <body>
        <AppShell email={email} isAdmin={role === "admin"} isSignedIn={Boolean(session)}>
          <main className="content">{children}</main>
          <SiteFooter />
        </AppShell>
        <SpeedInsights />
      </body>
    </html>
  );
}
