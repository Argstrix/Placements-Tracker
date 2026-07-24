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
