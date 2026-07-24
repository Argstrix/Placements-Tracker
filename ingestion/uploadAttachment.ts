import { put } from "@vercel/blob";
import type { ParsedAttachment } from "./parseMail";

export async function uploadToBlob(att: ParsedAttachment): Promise<string> {
  const blob = await put(att.filename, att.content, {
    // Access-controlled at the application layer via the attachment proxy
    // route, never linked directly — see security notes in the design spec.
    access: "public",
    contentType: att.mimeType,
    addRandomSuffix: true,
  });
  return blob.url;
}
