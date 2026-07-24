import Link from "next/link";
import { getServerSession } from "next-auth";
import { buildAuthOptions } from "@/auth/authOptions";
import { isAuthorized } from "@/auth/isAuthorized";
import { prisma } from "@/db/client";

export default async function NavBar() {
  const session = await getServerSession(buildAuthOptions());
  const role = session?.user?.email ? (await isAuthorized(session.user.email, prisma)).role : null;

  return (
    <nav className="border-b px-6 py-3 flex gap-4 items-center text-sm flex-wrap">
      <Link href="/" className="font-semibold">
        Placement Tracker
      </Link>
      <Link href="/companies" className="hover:underline">
        Companies
      </Link>
      <Link href="/announcements" className="hover:underline">
        Announcements
      </Link>
      <Link href="/search" className="hover:underline">
        Search Neo ID
      </Link>
      {session && (
        <Link href="/dashboard" className="hover:underline">
          My Dashboard
        </Link>
      )}
      {session && (
        <Link href="/report-issue" className="hover:underline">
          Report Issue
        </Link>
      )}
      {role === "admin" && (
        <Link href="/admin" className="hover:underline text-orange-600">
          Admin
        </Link>
      )}
      <span className="ml-auto text-gray-500">{session?.user?.email ?? "Not signed in"}</span>
    </nav>
  );
}
