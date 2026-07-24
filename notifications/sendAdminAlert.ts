import { google } from "googleapis";
import type { Env } from "@/env";

export async function sendAdminAlert(subject: string, body: string, env: Env): Promise<void> {
  const oauth2Client = new google.auth.OAuth2(env.GOOGLE_CLIENT_ID, env.GOOGLE_CLIENT_SECRET);
  oauth2Client.setCredentials({ refresh_token: env.GMAIL_REFRESH_TOKEN });
  const gmail = google.gmail({ version: "v1", auth: oauth2Client });

  const message = [
    `To: ${env.INITIAL_ADMIN_EMAIL}`,
    `Subject: ${subject}`,
    "Content-Type: text/plain; charset=utf-8",
    "",
    body,
  ].join("\n");

  const encoded = Buffer.from(message).toString("base64url");
  await gmail.users.messages.send({ userId: "me", requestBody: { raw: encoded } });
}
