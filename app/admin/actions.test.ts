import { describe, it, expect, vi } from "vitest";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/db/client", () => ({ prisma: {} }));
vi.mock("@/env", () => ({ getEnv: vi.fn().mockReturnValue({}) }));
vi.mock("@/ingestion/llmExtractor", () => ({ buildLlmClients: vi.fn() }));
vi.mock("@/ingestion/uploadAttachment", () => ({ uploadToBlob: vi.fn() }));
vi.mock("@/ingestion/gmailClient", () => ({ fetchGmailMessageRaw: vi.fn() }));
vi.mock("@/enrichment/enrichAndSaveCompany", () => ({ enrichAndSaveCompany: vi.fn() }));
vi.mock("@/ingestion/ingestMail", () => ({ ingestMail: vi.fn() }));

const mockGetServerSession = vi.fn();
vi.mock("next-auth", () => ({ getServerSession: (...args: unknown[]) => mockGetServerSession(...args) }));
vi.mock("@/auth/authOptions", () => ({ buildAuthOptions: vi.fn() }));

const mockIsAuthorized = vi.fn();
vi.mock("@/auth/isAuthorized", () => ({ isAuthorized: (...args: unknown[]) => mockIsAuthorized(...args) }));

describe("retryOne", () => {
  it("rejects when the caller is a student, not an admin", async () => {
    mockGetServerSession.mockResolvedValue({ user: { email: "student@vitstudent.ac.in" } });
    mockIsAuthorized.mockResolvedValue({ allowed: true, role: "student" });
    const { retryOne } = await import("./actions");
    await expect(retryOne("msg-1")).rejects.toThrow(/not authorized/i);
  });

  it("proceeds for an admin session", async () => {
    mockGetServerSession.mockResolvedValue({ user: { email: "owner@gmail.com" } });
    mockIsAuthorized.mockResolvedValue({ allowed: true, role: "admin" });
    const { fetchGmailMessageRaw } = await import("@/ingestion/gmailClient");
    vi.mocked(fetchGmailMessageRaw).mockResolvedValue(Buffer.from("raw"));
    const { ingestMail } = await import("@/ingestion/ingestMail");
    vi.mocked(ingestMail).mockResolvedValue({ status: "SUCCESS" });

    const { retryOne } = await import("./actions");
    await retryOne("msg-1");
    expect(ingestMail).toHaveBeenCalledOnce();
  });
});
