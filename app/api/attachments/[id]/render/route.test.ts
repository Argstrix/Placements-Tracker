import { describe, it, expect, vi } from "vitest";
import mammoth from "mammoth";
import * as XLSX from "xlsx";

const mockGetServerSession = vi.fn();
vi.mock("next-auth", () => ({ getServerSession: (...args: unknown[]) => mockGetServerSession(...args) }));
vi.mock("@/auth/authOptions", () => ({ buildAuthOptions: vi.fn() }));

const mockIsAuthorized = vi.fn();
vi.mock("@/auth/isAuthorized", () => ({ isAuthorized: (...args: unknown[]) => mockIsAuthorized(...args) }));

const mockFindUnique = vi.fn();
vi.mock("@/db/client", () => ({ prisma: { attachment: { findUnique: (...args: unknown[]) => mockFindUnique(...args) } } }));

const DOCX_MIME = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
const XLSX_MIME = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

describe("GET /api/attachments/[id]/render", () => {
  it("returns converted HTML for a docx attachment", async () => {
    mockGetServerSession.mockResolvedValue({ user: { email: "s@vitstudent.ac.in" } });
    mockIsAuthorized.mockResolvedValue({ allowed: true, role: "student" });
    mockFindUnique.mockResolvedValue({
      id: "abc",
      mimeType: DOCX_MIME,
      blobUrl: "https://blob.example/fake.docx",
      filename: "JD.docx",
    });
    global.fetch = vi.fn().mockResolvedValue({ arrayBuffer: async () => new ArrayBuffer(0) }) as unknown as typeof fetch;
    vi.spyOn(mammoth, "convertToHtml").mockResolvedValue({ value: "<p>Job description</p>", messages: [] });

    const { GET } = await import("./route");
    const res = await GET(new Request("http://localhost"), { params: Promise.resolve({ id: "abc" }) });
    const body = await res.json();
    expect(body.type).toBe("docx");
    expect(body.html).toContain("Job description");
  });

  it("returns sheet data for an xlsx attachment", async () => {
    mockGetServerSession.mockResolvedValue({ user: { email: "s@vitstudent.ac.in" } });
    mockIsAuthorized.mockResolvedValue({ allowed: true, role: "student" });
    mockFindUnique.mockResolvedValue({
      id: "xyz",
      mimeType: XLSX_MIME,
      blobUrl: "https://blob.example/fake.xlsx",
      filename: "shortlist.xlsx",
    });

    const workbook = XLSX.utils.book_new();
    const sheet = XLSX.utils.aoa_to_sheet([["Neo ID"], ["A1B2C3D4"]]);
    XLSX.utils.book_append_sheet(workbook, sheet, "Sheet1");
    const buf = XLSX.write(workbook, { type: "buffer", bookType: "xlsx" });
    global.fetch = vi.fn().mockResolvedValue({ arrayBuffer: async () => buf }) as unknown as typeof fetch;

    const { GET } = await import("./route");
    const res = await GET(new Request("http://localhost"), { params: Promise.resolve({ id: "xyz" }) });
    const body = await res.json();
    expect(body.type).toBe("xlsx");
    expect(body.sheets[0].name).toBe("Sheet1");
    expect(body.sheets[0].rows).toEqual(expect.arrayContaining([["A1B2C3D4"]]));
  });

  it("returns 403 for an unauthorized session", async () => {
    mockGetServerSession.mockResolvedValue({ user: { email: "random@gmail.com" } });
    mockIsAuthorized.mockResolvedValue({ allowed: false, role: null });
    const { GET } = await import("./route");
    const res = await GET(new Request("http://localhost"), { params: Promise.resolve({ id: "abc" }) });
    expect(res.status).toBe(403);
  });
});
