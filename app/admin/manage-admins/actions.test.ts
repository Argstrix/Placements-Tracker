import { describe, it, expect, vi } from "vitest";
import { createTestPrismaClient } from "@/db/testClient";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

vi.mock("@/db/client", async () => {
  const { createTestPrismaClient } = await import("@/db/testClient");
  const db = await createTestPrismaClient();
  return { prisma: db };
});

const mockGetSessionEmail = vi.fn();
vi.mock("./getSessionEmail", () => ({ getSessionEmail: mockGetSessionEmail }));

describe("addAdmin server action", () => {
  it("rejects when the caller is not already an admin", async () => {
    mockGetSessionEmail.mockResolvedValue("student@vitstudent.ac.in");
    const { addAdmin } = await import("./actions");
    const formData = new FormData();
    formData.set("email", "newadmin@gmail.com");
    await expect(addAdmin(formData)).rejects.toThrow(/not authorized/i);
  });

  it("allows an existing admin to add a new one", async () => {
    const { prisma } = await import("@/db/client");
    await (prisma as Awaited<ReturnType<typeof createTestPrismaClient>>).adminUser.create({
      data: { email: "owner@gmail.com" },
    });
    mockGetSessionEmail.mockResolvedValue("owner@gmail.com");

    const { addAdmin } = await import("./actions");
    const formData = new FormData();
    formData.set("email", "newadmin@gmail.com");
    await addAdmin(formData);

    const admins = await (prisma as Awaited<ReturnType<typeof createTestPrismaClient>>).adminUser.findMany();
    expect(admins.map((a) => a.email)).toContain("newadmin@gmail.com");
  });

  it("rejects an invalid email format", async () => {
    mockGetSessionEmail.mockResolvedValue("owner@gmail.com");
    const { addAdmin } = await import("./actions");
    const { prisma } = await import("@/db/client");
    const db = prisma as Awaited<ReturnType<typeof createTestPrismaClient>>;

    const before = await db.adminUser.count();
    const formData = new FormData();
    formData.set("email", "not-an-email");
    await expect(addAdmin(formData)).rejects.toThrow(/valid email/i);

    expect(await db.adminUser.count()).toBe(before);
  });

  it("rejects adding an email that's already an admin", async () => {
    mockGetSessionEmail.mockResolvedValue("owner@gmail.com");
    const { addAdmin } = await import("./actions");
    const { prisma } = await import("@/db/client");
    const db = prisma as Awaited<ReturnType<typeof createTestPrismaClient>>;

    const before = await db.adminUser.count();
    const formData = new FormData();
    formData.set("email", "owner@gmail.com");
    await expect(addAdmin(formData)).rejects.toThrow(/already an admin/i);

    expect(await db.adminUser.count()).toBe(before);
  });
});

describe("removeAdmin server action", () => {
  it("allows removal when more than one admin remains", async () => {
    // Continues from the shared test DB above: owner@gmail.com and
    // newadmin@gmail.com both exist at this point.
    mockGetSessionEmail.mockResolvedValue("owner@gmail.com");
    const { removeAdmin } = await import("./actions");
    const { prisma } = await import("@/db/client");
    const db = prisma as Awaited<ReturnType<typeof createTestPrismaClient>>;

    const target = await db.adminUser.findFirstOrThrow({ where: { email: "newadmin@gmail.com" } });
    await removeAdmin(target.id);

    const admins = await db.adminUser.findMany();
    expect(admins.map((a) => a.email)).toEqual(["owner@gmail.com"]);
  });

  it("refuses to remove the last remaining admin", async () => {
    mockGetSessionEmail.mockResolvedValue("owner@gmail.com");
    const { removeAdmin } = await import("./actions");
    const { prisma } = await import("@/db/client");
    const db = prisma as Awaited<ReturnType<typeof createTestPrismaClient>>;

    const last = await db.adminUser.findFirstOrThrow({ where: { email: "owner@gmail.com" } });
    await expect(removeAdmin(last.id)).rejects.toThrow(/last remaining admin/i);

    const admins = await db.adminUser.findMany();
    expect(admins).toHaveLength(1);
  });
});
