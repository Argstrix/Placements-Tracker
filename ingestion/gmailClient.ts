import { google } from "googleapis";
import type { Env } from "@/env";

function buildGmailApiClient(env: Env) {
  const oauth2Client = new google.auth.OAuth2(env.GOOGLE_CLIENT_ID, env.GOOGLE_CLIENT_SECRET);
  oauth2Client.setCredentials({ refresh_token: env.GMAIL_REFRESH_TOKEN });
  return google.gmail({ version: "v1", auth: oauth2Client });
}

export async function fetchGmailMessageRaw(messageId: string, env: Env): Promise<Buffer> {
  const gmail = buildGmailApiClient(env);
  const res = await gmail.users.messages.get({ userId: "me", id: messageId, format: "raw" });
  const raw = res.data.raw;
  if (!raw) throw new Error(`Gmail message ${messageId} had no raw payload`);
  return Buffer.from(raw, "base64url");
}

/** Message IDs currently under the watched label, newest first. */
export async function listLabeledMessageIds(env: Env): Promise<string[]> {
  const gmail = buildGmailApiClient(env);
  const res = await gmail.users.messages.list({ userId: "me", labelIds: [env.GMAIL_LABEL_ID], maxResults: 50 });
  return (res.data.messages ?? []).map((m) => m.id).filter((id): id is string => Boolean(id));
}

export async function renewGmailWatch(env: Env): Promise<void> {
  const gmail = buildGmailApiClient(env);
  await gmail.users.watch({
    userId: "me",
    requestBody: {
      labelIds: [env.GMAIL_LABEL_ID],
      topicName: env.GMAIL_PUBSUB_TOPIC,
    },
  });
}
