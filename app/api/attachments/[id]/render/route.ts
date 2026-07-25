import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { buildAuthOptions } from "@/auth/authOptions";
import { isAuthorized } from "@/auth/isAuthorized";
import { prisma } from "@/db/client";
import mammoth from "mammoth";
import * as XLSX from "xlsx";

const DOCX_MIME = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
const XLSX_MIME = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(buildAuthOptions());
  if (!session?.user?.email) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { allowed } = await isAuthorized(session.user.email, prisma);
  if (!allowed) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const { id } = await params;
  const attachment = await prisma.attachment.findUnique({ where: { id } });
  if (!attachment) return NextResponse.json({ error: "not found" }, { status: 404 });

  // Tombstoned by the retention sweep — the row survives, the file doesn't.
  if (!attachment.blobUrl) {
    return NextResponse.json({ error: "attachment removed to save storage" }, { status: 410 });
  }

  const upstream = await fetch(attachment.blobUrl);
  const buffer = Buffer.from(await upstream.arrayBuffer());

  if (attachment.mimeType === DOCX_MIME) {
    const { value: html } = await mammoth.convertToHtml({ buffer });
    return NextResponse.json({ type: "docx", html });
  }

  if (attachment.mimeType === XLSX_MIME) {
    const workbook = XLSX.read(buffer, { type: "buffer" });
    const sheets = workbook.SheetNames.map((name) => ({
      name,
      rows: XLSX.utils.sheet_to_json(workbook.Sheets[name], { header: 1 }) as unknown[][],
    }));
    return NextResponse.json({ type: "xlsx", sheets });
  }

  return NextResponse.json({ error: "unsupported type for structured render" }, { status: 415 });
}
