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
});
