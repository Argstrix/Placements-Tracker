import { describe, it, expect, vi } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/env", () => ({
  getEnv: vi.fn().mockReturnValue({ GMAIL_PUBSUB_VERIFICATION_TOKEN: "test-token" }),
}));
vi.mock("@/ingestion/gmailClient", () => ({
  fetchGmailMessageRaw: vi.fn(),
  listLabeledMessageIds: vi.fn().mockResolvedValue([]),
}));
vi.mock("@/ingestion/llmExtractor", () => ({ buildLlmClients: vi.fn().mockReturnValue({}) }));
vi.mock("@/ingestion/uploadAttachment", () => ({ uploadToBlob: vi.fn() }));
vi.mock("@/ingestion/syncGmailLabel", () => ({
  syncNewMailFromLabel: vi.fn().mockResolvedValue({ processed: 0 }),
}));
vi.mock("@/db/client", () => ({ prisma: {} }));

describe("POST /api/ingest/gmail-webhook", () => {
  it("rejects a request missing the verification token", async () => {
    const { POST } = await import("./route");
    const req = new NextRequest("http://localhost/api/ingest/gmail-webhook", {
      method: "POST",
      body: JSON.stringify({ message: { data: Buffer.from(JSON.stringify({ historyId: "1" })).toString("base64") } }),
    });
    const res = await POST(req);
    expect(res.status).toBe(401);
  });

  it("accepts a correctly-tokened request and syncs the label", async () => {
    const { POST } = await import("./route");
    const { syncNewMailFromLabel } = await import("@/ingestion/syncGmailLabel");
    const req = new NextRequest("http://localhost/api/ingest/gmail-webhook?token=test-token", {
      method: "POST",
      body: JSON.stringify({ message: { data: "" } }),
    });
    const res = await POST(req);
    expect(res.status).toBe(200);
    expect(syncNewMailFromLabel).toHaveBeenCalledOnce();
  });
});
