import type { Metadata } from "next";
import { getServerSession } from "next-auth";
import { buildAuthOptions } from "@/auth/authOptions";
import { isAuthorized } from "@/auth/isAuthorized";
import { prisma } from "@/db/client";
import AppShell from "./components/AppShell";
import SiteFooter from "./components/SiteFooter";
import "./globals.css";

export const metadata: Metadata = {
  title: "Placement Board — VIT placement tracker",
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
    <html lang="en" className="antialiased">
      <body>
        <AppShell email={email} isAdmin={role === "admin"} isSignedIn={Boolean(session)}>
          <main className="content">{children}</main>
          <SiteFooter />
        </AppShell>
      </body>
    </html>
  );
}
