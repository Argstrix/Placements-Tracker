"use server";
import { prisma } from "@/db/client";
import { getEnv } from "@/env";
import { buildLlmClients } from "@/ingestion/llmExtractor";
import { uploadToBlob } from "@/ingestion/uploadAttachment";
import { fetchGmailMessageRaw } from "@/ingestion/gmailClient";
import { ingestMail } from "@/ingestion/ingestMail";
import { enrichAndSaveCompany } from "@/enrichment/enrichAndSaveCompany";
import { getServerSession } from "next-auth";
import { buildAuthOptions } from "@/auth/authOptions";
import { isAuthorized } from "@/auth/isAuthorized";
import { revalidatePath } from "next/cache";

async function requireAdmin(): Promise<void> {
  const session = await getServerSession(buildAuthOptions());
  if (!session?.user?.email) throw new Error("Not authorized: no session");
  const { role } = await isAuthorized(session.user.email, prisma);
  if (role !== "admin") throw new Error("Not authorized: admin role required");
}

/**
 * Retires a company by hand, ahead of the automatic thresholds. Marks only —
 * the blob purge happens on the next nightly sweep, so there is exactly one
 * code path that deletes files and this action stays fast.
 */
export async function retireCompany(companyId: string): Promise<void> {
  await requireAdmin();
  await prisma.company.update({
    where: { id: companyId },
    data: { retiredAt: new Date() },
  });
  revalidatePath("/admin/retention");
}

/**
 * Returns a company to the live pool. Clears both markers so the sweep will
 * re-evaluate it from scratch — but any file already deleted is gone for good,
 * which the dashboard warns about before this runs.
 */
export async function unretireCompany(companyId: string): Promise<void> {
  await requireAdmin();
  await prisma.company.update({
    where: { id: companyId },
    data: { retiredAt: null, purgedAt: null },
  });
  revalidatePath("/admin/retention");
}

export async function retryOne(gmailMessageId: string): Promise<void> {
  await requireAdmin();
  const env = getEnv();
  const raw = await fetchGmailMessageRaw(gmailMessageId, env);
  await ingestMail(raw, gmailMessageId, {
    db: prisma,
    llmClients: buildLlmClients(env),
    uploadAttachment: uploadToBlob,
    onNewCompany: (company) => enrichAndSaveCompany(company, prisma, env),
  });
  revalidatePath("/admin");
}
