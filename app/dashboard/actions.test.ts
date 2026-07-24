import { describe, it, expect, vi } from "vitest";
import { createTestPrismaClient } from "@/db/testClient";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

vi.mock("@/db/client", async () => {
  const { createTestPrismaClient } = await import("@/db/testClient");
  const db = await createTestPrismaClient();
  return { prisma: db };
});

const mockGetServerSession = vi.fn();
vi.mock("next-auth", () => ({ getServerSession: (...args: unknown[]) => mockGetServerSession(...args) }));
vi.mock("@/auth/authOptions", () => ({ buildAuthOptions: vi.fn() }));

describe("setNeoId", () => {
  it("rejects when there is no session", async () => {
    mockGetServerSession.mockResolvedValue(null);
    const { setNeoId } = await import("./actions");
    const formData = new FormData();
    formData.set("neoId", "abc12345");
    await expect(setNeoId(formData)).rejects.toThrow(/not authorized/i);
  });

  it("upserts the user's Neo ID, uppercased", async () => {
    mockGetServerSession.mockResolvedValue({ user: { email: "student@vitstudent.ac.in" } });
    const { setNeoId } = await import("./actions");
    const { prisma } = await import("@/db/client");

    const formData = new FormData();
    formData.set("neoId", "a1b2c3d4");
    await setNeoId(formData);

    const user = await (prisma as Awaited<ReturnType<typeof createTestPrismaClient>>).user.findUnique({
      where: { email: "student@vitstudent.ac.in" },
    });
    expect(user?.neoId).toBe("A1B2C3D4");
  });

  it("is optional — an empty submission clears it rather than saving a stray string", async () => {
    mockGetServerSession.mockResolvedValue({ user: { email: "student3@vitstudent.ac.in" } });
    const { setNeoId } = await import("./actions");
    const { prisma } = await import("@/db/client");
    const db = prisma as Awaited<ReturnType<typeof createTestPrismaClient>>;

    const withValue = new FormData();
    withValue.set("neoId", "z9z9z9z9");
    await setNeoId(withValue);

    const empty = new FormData();
    empty.set("neoId", "");
    await setNeoId(empty);

    const user = await db.user.findUnique({ where: { email: "student3@vitstudent.ac.in" } });
    expect(user?.neoId).toBeNull();
  });
});

describe("deleteMyData", () => {
  it("rejects when there is no session", async () => {
    mockGetServerSession.mockResolvedValue(null);
    const { deleteMyData } = await import("./actions");
    await expect(deleteMyData()).rejects.toThrow(/not authorized/i);
  });

  it("is a no-op when the user has no saved data", async () => {
    mockGetServerSession.mockResolvedValue({ user: { email: "never-saved-anything@vitstudent.ac.in" } });
    const { deleteMyData } = await import("./actions");
    await expect(deleteMyData()).resolves.not.toThrow();
  });

  it("removes the user's Neo ID and interest records, without touching the company", async () => {
    mockGetServerSession.mockResolvedValue({ user: { email: "student4@vitstudent.ac.in" } });
    const { setNeoId, setInterest, deleteMyData } = await import("./actions");
    const { prisma } = await import("@/db/client");
    const db = prisma as Awaited<ReturnType<typeof createTestPrismaClient>>;

    const company = await db.company.create({ data: { name: "Erasure Co", normalizedName: "erasure-co" } });
    const formData = new FormData();
    formData.set("neoId", "d4d4d4d4");
    await setNeoId(formData);
    await setInterest(company.id, "interested");

    await deleteMyData();

    const user = await db.user.findUnique({ where: { email: "student4@vitstudent.ac.in" } });
    expect(user).toBeNull();
    const interests = await db.interest.findMany({ where: { companyId: company.id } });
    expect(interests).toHaveLength(0);
    const stillExists = await db.company.findUnique({ where: { id: company.id } });
    expect(stillExists).not.toBeNull();
  });
});

describe("setInterest", () => {
  it("creates an Interest row tying the user to the company with a status", async () => {
    mockGetServerSession.mockResolvedValue({ user: { email: "student2@vitstudent.ac.in" } });
    const { setInterest } = await import("./actions");
    const { prisma } = await import("@/db/client");
    const db = prisma as Awaited<ReturnType<typeof createTestPrismaClient>>;

    const company = await db.company.create({ data: { name: "Acme", normalizedName: "acme-interest" } });
    await setInterest(company.id, "interested");

    const interest = await db.interest.findFirst({ where: { companyId: company.id } });
    expect(interest?.status).toBe("interested");
  });
});
