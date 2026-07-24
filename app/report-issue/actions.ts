"use server";
import { prisma } from "@/db/client";
import { getServerSession } from "next-auth";
import { buildAuthOptions } from "@/auth/authOptions";

export async function reportIssue(formData: FormData): Promise<void> {
  const session = await getServerSession(buildAuthOptions());
  if (!session?.user?.email) throw new Error("Not authorized");
  const description = String(formData.get("description"));
  const companyId = formData.get("companyId") ? String(formData.get("companyId")) : null;
  await prisma.reportedIssue.create({
    data: { description, companyId, reporterEmail: session.user.email },
  });
}
