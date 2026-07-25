import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { buildAuthOptions } from "@/auth/authOptions";
import { isAuthorized } from "@/auth/isAuthorized";
import { prisma } from "@/db/client";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(buildAuthOptions());
  if (!session?.user?.email) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { allowed } = await isAuthorized(session.user.email, prisma);
  if (!allowed) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const { id } = await params;
  const attachment = await prisma.attachment.findUnique({ where: { id } });
  if (!attachment) return NextResponse.json({ error: "not found" }, { status: 404 });

  // The row outlives the file: once its company retired, the stored file was
  // deleted to reclaim space and only a tombstone remains. 410 rather than 404
  // so the distinction between "never existed" and "deliberately removed" is
  // preserved. Checked after auth, so it can't be used to probe for
  // attachment IDs without a session.
  if (!attachment.blobUrl) {
    return NextResponse.json({ error: "attachment removed to save storage" }, { status: 410 });
  }

  // Blob storage holds the file; this route is the only sanctioned way to
  // reach it, so the login gate can never be bypassed by sharing a direct
  // Blob URL.
  const upstream = await fetch(attachment.blobUrl);
  return new NextResponse(upstream.body, {
    headers: {
      "Content-Type": attachment.mimeType,
      "Content-Disposition": `inline; filename="${attachment.filename}"`,
    },
  });
}
