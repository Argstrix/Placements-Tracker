import AttachmentViewer from "./attachments/AttachmentViewer";
import type { MailEvent, Attachment } from "@prisma/client";

export default function MailEventCard({ event }: { event: MailEvent & { attachments: Attachment[] } }) {
  return (
    <div className="border rounded p-4 space-y-2">
      <div className="text-xs uppercase tracking-wide text-gray-500">{event.type.replace("_", " ")}</div>
      <div className="text-sm text-gray-600">
        <strong>{event.subject}</strong> — {event.receivedAt.toLocaleString()} — from {event.sender}
      </div>
      <details className="text-sm">
        <summary className="cursor-pointer text-blue-600">View original mail</summary>
        <pre className="whitespace-pre-wrap mt-2 text-gray-700">{event.bodyText}</pre>
      </details>
      {event.attachments.map((a) => (
        <div key={a.id} className="mt-2">
          <div className="text-xs text-gray-500 mb-1">{a.filename}</div>
          <AttachmentViewer attachment={a} />
        </div>
      ))}
    </div>
  );
}
