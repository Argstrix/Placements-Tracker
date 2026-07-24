import { describe, it, expect, vi } from "vitest";
import { createTestPrismaClient } from "@/db/testClient";

vi.mock("@/db/client", async () => {
  const { createTestPrismaClient } = await import("@/db/testClient");
  const db = await createTestPrismaClient();
  return { prisma: db };
});

const mockGetServerSession = vi.fn();
vi.mock("next-auth", () => ({ getServerSession: (...args: unknown[]) => mockGetServerSession(...args) }));
vi.mock("@/auth/authOptions", () => ({ buildAuthOptions: vi.fn() }));

describe("reportIssue", () => {
  it("rejects when there is no session", async () => {
    mockGetServerSession.mockResolvedValue(null);
    const { reportIssue } = await import("./actions");
    const formData = new FormData();
    formData.set("description", "the date looks wrong");
    await expect(reportIssue(formData)).rejects.toThrow(/not authorized/i);
  });

  it("stores the report with the reporter's email", async () => {
    mockGetServerSession.mockResolvedValue({ user: { email: "student@vitstudent.ac.in" } });
    const { reportIssue } = await import("./actions");
    const { prisma } = await import("@/db/client");
    const db = prisma as Awaited<ReturnType<typeof createTestPrismaClient>>;

    const formData = new FormData();
    formData.set("description", "the date looks wrong");
    await reportIssue(formData);

    const issues = await db.reportedIssue.findMany();
    expect(issues).toHaveLength(1);
    expect(issues[0].reporterEmail).toBe("student@vitstudent.ac.in");
    expect(issues[0].description).toBe("the date looks wrong");
  });
});
