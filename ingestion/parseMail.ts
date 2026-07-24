import { simpleParser } from "mailparser";

export interface ParsedAttachment {
  filename: string;
  mimeType: string;
  content: Buffer;
}

export interface ParsedMail {
  subject: string;
  from: string;
  receivedAt: Date;
  bodyText: string;
  attachments: ParsedAttachment[];
}

export async function parseMail(raw: Buffer): Promise<ParsedMail> {
  const parsed = await simpleParser(raw);
  return {
    subject: parsed.subject ?? "",
    from: parsed.from?.text ?? "",
    receivedAt: parsed.date ?? new Date(),
    bodyText: parsed.text ?? "",
    attachments: parsed.attachments.map((a) => ({
      filename: a.filename ?? "attachment",
      mimeType: a.contentType,
      content: a.content,
    })),
  };
}
