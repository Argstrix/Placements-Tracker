"use client";
import dynamic from "next/dynamic";
import DocxViewer from "./DocxViewer";
import XlsxViewer from "./XlsxViewer";

// react-pdf needs browser APIs (a Worker, canvas) unavailable during SSR.
const PdfViewer = dynamic(() => import("./PdfViewer"), { ssr: false });

interface Props {
  attachment: { id: string; filename: string; mimeType: string };
}

const DOCX_MIME = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
const XLSX_MIME = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
const LEGACY_DOC_MIME = "application/msword";

export default function AttachmentViewer({ attachment }: Props) {
  const fileUrl = `/api/attachments/${attachment.id}`;
  const renderUrl = `/api/attachments/${attachment.id}/render`;

  if (attachment.mimeType === "application/pdf") return <PdfViewer url={fileUrl} />;
  if (attachment.mimeType === DOCX_MIME) return <DocxViewer renderUrl={renderUrl} />;
  if (attachment.mimeType === XLSX_MIME) return <XlsxViewer renderUrl={renderUrl} />;
  if (attachment.mimeType === LEGACY_DOC_MIME) {
    return (
      <a href={fileUrl} className="text-blue-600 underline text-sm">
        Download {attachment.filename} (.doc preview isn&apos;t supported — download to view)
      </a>
    );
  }
  return (
    <a href={fileUrl} className="text-blue-600 underline text-sm">
      Download {attachment.filename}
    </a>
  );
}
