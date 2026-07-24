import { NextRequest, NextResponse } from "next/server";
import { getEnv } from "@/env";
import { ingestMail } from "@/ingestion/ingestMail";
import { buildLlmClients } from "@/ingestion/llmExtractor";
import { uploadToBlob } from "@/ingestion/uploadAttachment";
import { enrichAndSaveCompany } from "@/enrichment/enrichAndSaveCompany";
import { prisma } from "@/db/client";
import { isAuthorized } from "@/auth/isAuthorized";
import { getServerSession } from "next-auth";
import { buildAuthOptions } from "@/auth/authOptions";

// Admin-only: lets the admin paste in a raw .eml (e.g. one they saved from
// Gmail directly) and run it through the exact same pipeline the webhook
// uses, without needing a live Pub/Sub push. Useful for verifying
// extraction on a real mail before broader rollout.
export async function POST(req: NextRequest) {
  const session = await getServerSession(buildAuthOptions());
  if (!session?.user?.email) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { role } = await isAuthorized(session.user.email, prisma);
  if (role !== "admin") return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const env = getEnv();
  const raw = Buffer.from(await req.arrayBuffer());
  const messageId = req.nextUrl.searchParams.get("id") ?? `manual-${Date.now()}`;

  const result = await ingestMail(raw, messageId, {
    db: prisma,
    llmClients: buildLlmClients(env),
    uploadAttachment: uploadToBlob,
    onNewCompany: (company) => enrichAndSaveCompany(company, prisma, env),
  });

  return NextResponse.json(result, { status: result.status === "SUCCESS" ? 200 : 422 });
}
