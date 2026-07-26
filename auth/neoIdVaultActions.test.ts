import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
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

describe("neoIdVaultActions", () => {
  const REAL_SECRET = process.env.NEO_ID_ENC_SECRET;
  beforeEach(() => {
    process.env.NEO_ID_ENC_SECRET = "test-vault-secret";
  });
  afterEach(() => {
    process.env.NEO_ID_ENC_SECRET = REAL_SECRET;
  });

  describe("saveNeoId", () => {
    it("rejects when there is no session", async () => {
      mockGetServerSession.mockResolvedValue(null);
      const { saveNeoId } = await import("./neoIdVaultActions");
      await expect(saveNeoId("23BCE1234")).rejects.toThrow(/not authorized/i);
    });

    it("creates a user row with the encrypted Neo ID and dismisses the prompt", async () => {
      mockGetServerSession.mockResolvedValue({ user: { email: "saver@vitstudent.ac.in" } });
      const { saveNeoId } = await import("./neoIdVaultActions");
      const { decryptNeoId } = await import("./neoIdVault");
      const { prisma } = await import("@/db/client");
      const db = prisma as Awaited<ReturnType<typeof createTestPrismaClient>>;

      await saveNeoId("23bce1234");

      const user = await db.user.findUnique({ where: { email: "saver@vitstudent.ac.in" } });
      expect(user?.neoIdEncrypted).not.toBeNull();
      expect(decryptNeoId(user!.neoIdEncrypted!)).toBe("23BCE1234");
      expect(user?.neoIdPromptDismissedAt).not.toBeNull();
    });
  });

  describe("dismissNeoIdPrompt", () => {
    it("marks the prompt dismissed without saving a Neo ID", async () => {
      mockGetServerSession.mockResolvedValue({ user: { email: "decliner@vitstudent.ac.in" } });
      const { dismissNeoIdPrompt } = await import("./neoIdVaultActions");
      const { prisma } = await import("@/db/client");
      const db = prisma as Awaited<ReturnType<typeof createTestPrismaClient>>;

      await dismissNeoIdPrompt();

      const user = await db.user.findUnique({ where: { email: "decliner@vitstudent.ac.in" } });
      expect(user?.neoIdEncrypted).toBeNull();
      expect(user?.neoIdPromptDismissedAt).not.toBeNull();
    });
  });

  describe("forgetNeoId", () => {
    it("is a no-op when the user has no row yet", async () => {
      mockGetServerSession.mockResolvedValue({ user: { email: "never-saved@vitstudent.ac.in" } });
      const { forgetNeoId } = await import("./neoIdVaultActions");
      await expect(forgetNeoId()).resolves.not.toThrow();
    });

    it("clears the saved Neo ID but keeps the dismissed timestamp", async () => {
      mockGetServerSession.mockResolvedValue({ user: { email: "forgetter@vitstudent.ac.in" } });
      const { saveNeoId, forgetNeoId } = await import("./neoIdVaultActions");
      const { prisma } = await import("@/db/client");
      const db = prisma as Awaited<ReturnType<typeof createTestPrismaClient>>;

      await saveNeoId("23BCE1234");
      const before = await db.user.findUnique({ where: { email: "forgetter@vitstudent.ac.in" } });

      await forgetNeoId();

      const after = await db.user.findUnique({ where: { email: "forgetter@vitstudent.ac.in" } });
      expect(after?.neoIdEncrypted).toBeNull();
      expect(after?.neoIdPromptDismissedAt).toEqual(before?.neoIdPromptDismissedAt);
    });
  });
});
