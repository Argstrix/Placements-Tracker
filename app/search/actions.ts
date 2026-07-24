"use server";
import { prisma } from "@/db/client";
import { getServerSession } from "next-auth";
import { buildAuthOptions } from "@/auth/authOptions";
import { isAuthorized } from "@/auth/isAuthorized";
import { searchNeoId } from "@/queries/searchNeoId";

export interface ShortlistMatch {
  company: string;
  companyId: string;
  subject: string;
}

export interface CheckResult {
  error?: string;
  matches?: ShortlistMatch[];
}

/**
 * Checks a Neo ID against stored shortlist hashes. The ID arrives in the action
 * payload (never the URL), is hashed for the lookup, and is never written
 * anywhere — no database row, no log. Returns only the companies that
 * shortlisted it.
 */
export async function checkShortlist(neoId: string): Promise<CheckResult> {
  const session = await getServerSession(buildAuthOptions());
  if (!session?.user?.email) return { error: "Sign in to check your shortlist status." };
  const { allowed } = await isAuthorized(session.user.email, prisma);
  if (!allowed) return { error: "Your account isn't authorized to view shortlists." };

  const id = neoId.trim();
  if (id.length < 6) return { error: "Enter your full Neo ID — the 8-character code with letters and digits." };

  const rows = await searchNeoId(prisma, id);
  const matches: ShortlistMatch[] = rows
    .filter((r) => r.mailEvent.company)
    .map((r) => ({ company: r.mailEvent.company!.name, companyId: r.mailEvent.company!.id, subject: r.mailEvent.subject }));
  return { matches };
}
