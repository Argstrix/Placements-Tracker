import { describe, it, expect, vi } from "vitest";

const mockGetServerSession = vi.fn();
vi.mock("next-auth", () => ({ getServerSession: (...args: unknown[]) => mockGetServerSession(...args) }));
vi.mock("@/auth/authOptions", () => ({ buildAuthOptions: vi.fn() }));

const mockIsAuthorized = vi.fn();
vi.mock("@/auth/isAuthorized", () => ({ isAuthorized: (...args: unknown[]) => mockIsAuthorized(...args) }));

const mockFindUnique = vi.fn();
vi.mock("@/db/client", () => ({ prisma: { attachment: { findUnique: (...args: unknown[]) => mockFindUnique(...args) } } }));

describe("GET /api/attachments/[id]", () => {
  it("returns 401 when there is no session", async () => {
    mockGetServerSession.mockResolvedValue(null);
    const { GET } = await import("./route");
    const res = await GET(new Request("http://localhost/api/attachments/abc"), { params: Promise.resolve({ id: "abc" }) });
    expect(res.status).toBe(401);
  });

  it("returns 403 when the session is unauthorized", async () => {
    mockGetServerSession.mockResolvedValue({ user: { email: "random@gmail.com" } });
    mockIsAuthorized.mockResolvedValue({ allowed: false, role: null });
    const { GET } = await import("./route");
    const res = await GET(new Request("http://localhost/api/attachments/abc"), { params: Promise.resolve({ id: "abc" }) });
    expect(res.status).toBe(403);
  });

  it("returns 404 when the attachment doesn't exist", async () => {
    mockGetServerSession.mockResolvedValue({ user: { email: "student@vitstudent.ac.in" } });
    mockIsAuthorized.mockResolvedValue({ allowed: true, role: "student" });
    mockFindUnique.mockResolvedValue(null);
    const { GET } = await import("./route");
    const res = await GET(new Request("http://localhost/api/attachments/missing"), { params: Promise.resolve({ id: "missing" }) });
    expect(res.status).toBe(404);
  });

  it("returns 410 when the file was reclaimed after its company retired", async () => {
    mockGetServerSession.mockResolvedValue({ user: { email: "student@vitstudent.ac.in" } });
    mockIsAuthorized.mockResolvedValue({ allowed: true, role: "student" });
    mockFindUnique.mockResolvedValue({
      id: "abc",
      filename: "JD.pdf",
      mimeType: "application/pdf",
      blobUrl: null,
      purgedAt: new Date(),
    });
    const { GET } = await import("./route");
    const res = await GET(new Request("http://localhost/api/attachments/abc"), { params: Promise.resolve({ id: "abc" }) });
    // 410, not 404 — "deliberately removed" is a different answer to "never existed".
    expect(res.status).toBe(410);
  });

  it("checks authorization before revealing that an attachment was purged", async () => {
    mockGetServerSession.mockResolvedValue({ user: { email: "random@gmail.com" } });
    mockIsAuthorized.mockResolvedValue({ allowed: false, role: null });
    mockFindUnique.mockResolvedValue({ id: "abc", filename: "JD.pdf", mimeType: "application/pdf", blobUrl: null });
    const { GET } = await import("./route");
    const res = await GET(new Request("http://localhost/api/attachments/abc"), { params: Promise.resolve({ id: "abc" }) });
    expect(res.status).toBe(403);
  });

  it("streams the file with the correct headers for an authorized request", async () => {
    mockGetServerSession.mockResolvedValue({ user: { email: "student@vitstudent.ac.in" } });
    mockIsAuthorized.mockResolvedValue({ allowed: true, role: "student" });
    mockFindUnique.mockResolvedValue({
      id: "abc",
      filename: "JD.pdf",
      mimeType: "application/pdf",
      blobUrl: "https://blob.example/jd.pdf",
    });
    global.fetch = vi.fn().mockResolvedValue({ body: new ReadableStream() }) as unknown as typeof fetch;

    const { GET } = await import("./route");
    const res = await GET(new Request("http://localhost/api/attachments/abc"), { params: Promise.resolve({ id: "abc" }) });
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe("application/pdf");
    expect(res.headers.get("Content-Disposition")).toContain("JD.pdf");
  });
});
