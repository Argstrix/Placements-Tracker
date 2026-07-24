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
