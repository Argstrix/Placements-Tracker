import { describe, it, expect, vi } from "vitest";
import { NextRequest } from "next/server";

const mockGetServerSession = vi.fn();
vi.mock("next-auth", () => ({ getServerSession: (...args: unknown[]) => mockGetServerSession(...args) }));
vi.mock("@/auth/authOptions", () => ({ buildAuthOptions: vi.fn() }));

const mockIsAuthorized = vi.fn();
vi.mock("@/auth/isAuthorized", () => ({ isAuthorized: (...args: unknown[]) => mockIsAuthorized(...args) }));

vi.mock("@/env", () => ({ getEnv: vi.fn().mockReturnValue({}) }));
vi.mock("@/ingestion/llmExtractor", () => ({ buildLlmClients: vi.fn().mockReturnValue({}) }));
vi.mock("@/ingestion/uploadAttachment", () => ({ uploadToBlob: vi.fn() }));
vi.mock("@/db/client", () => ({ prisma: {} }));

const mockIngestMail = vi.fn();
vi.mock("@/ingestion/ingestMail", () => ({ ingestMail: (...args: unknown[]) => mockIngestMail(...args) }));

describe("POST /api/ingest/manual", () => {
  it("returns 401 when there is no session", async () => {
    mockGetServerSession.mockResolvedValue(null);
    const { POST } = await import("./route");
    const req = new NextRequest("http://localhost/api/ingest/manual", { method: "POST", body: "raw eml" });
    const res = await POST(req);
    expect(res.status).toBe(401);
  });

  it("returns 403 when the session is a student, not an admin", async () => {
    mockGetServerSession.mockResolvedValue({ user: { email: "student@vitstudent.ac.in" } });
    mockIsAuthorized.mockResolvedValue({ allowed: true, role: "student" });
    const { POST } = await import("./route");
    const req = new NextRequest("http://localhost/api/ingest/manual", { method: "POST", body: "raw eml" });
    const res = await POST(req);
    expect(res.status).toBe(403);
  });

  it("ingests the posted bytes for an admin session", async () => {
    mockGetServerSession.mockResolvedValue({ user: { email: "owner@gmail.com" } });
    mockIsAuthorized.mockResolvedValue({ allowed: true, role: "admin" });
    mockIngestMail.mockResolvedValue({ status: "SUCCESS", mailEventId: "abc" });

    const { POST } = await import("./route");
    const req = new NextRequest("http://localhost/api/ingest/manual", { method: "POST", body: "raw eml" });
    const res = await POST(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.status).toBe("SUCCESS");
    expect(mockIngestMail).toHaveBeenCalledOnce();
  });
});
