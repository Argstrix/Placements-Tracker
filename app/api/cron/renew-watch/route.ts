import { NextRequest, NextResponse } from "next/server";
import { getEnv } from "@/env";
import { renewGmailWatch } from "@/ingestion/gmailClient";
import { verifyCronRequest } from "@/ingestion/verifyCronRequest";

export async function GET(req: NextRequest) {
  const env = getEnv();
  if (!verifyCronRequest(req, env)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  await renewGmailWatch(env);
  return NextResponse.json({ ok: true, renewedAt: new Date().toISOString() });
}
