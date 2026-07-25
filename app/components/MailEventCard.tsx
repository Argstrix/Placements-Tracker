import AttachmentViewer from "./attachments/AttachmentViewer";
import { mailMeta } from "./mailMeta";
import type { MailEvent, Attachment } from "@prisma/client";

export default function MailEventCard({ event }: { event: MailEvent & { attachments: Attachment[] } }) {
  const meta = mailMeta(event.type);
  return (
    <article className="mail">
      <span className={`mtype ${meta.cls}`} aria-hidden="true" />
      <div className="mbody">
        <div className="mmeta">
          <span className={`tag ${meta.cls}`}>{meta.label}</span>
          <span className="mdate">{event.receivedAt.toLocaleString()}</span>
          <span className="mdate" style={{ marginLeft: "auto" }}>
            from {event.sender}
          </span>
        </div>
        <h4>{event.subject}</h4>
        <details style={{ marginTop: 8 }}>
          <summary className="mono" style={{ cursor: "pointer", color: "var(--info)", fontSize: ".78rem" }}>
            View original mail
          </summary>
          <pre className="mono" style={{ whiteSpace: "pre-wrap", marginTop: 8, fontSize: ".78rem", color: "var(--muted)" }}>
            {event.bodyText}
          </pre>
        </details>
        {event.attachments.map((a) => (
          <div key={a.id} style={{ marginTop: 10 }}>
            <div className="mono" style={{ fontSize: ".72rem", color: "var(--muted)", marginBottom: 6 }}>
              {a.filename}
            </div>
            {a.blobUrl ? (
              <AttachmentViewer attachment={a} />
            ) : (
              // The file was deleted once this company's drive finished, to stay
              // inside free-tier storage. Saying so beats a mail that references
              // an attachment which silently isn't there.
              <p className="mono" style={{ fontSize: ".72rem", color: "var(--muted)" }}>
                File removed to save storage — the original mail text above is unchanged.
              </p>
            )}
          </div>
        ))}
      </div>
    </article>
  );
}
