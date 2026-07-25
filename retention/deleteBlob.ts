import { del } from "@vercel/blob";

/**
 * Removes a file from blob storage. Mirrors ingestion/uploadAttachment.ts as
 * the single place the app talks to @vercel/blob, so the retention pass can be
 * tested without network access.
 *
 * Deleting an already-deleted blob is a no-op rather than an error, which is
 * what makes the purge safe to re-run after an interrupted sweep.
 */
export async function deleteFromBlob(url: string): Promise<void> {
  await del(url);
}
