import { describe, it, expect, beforeEach } from "vitest";
import { createTestPrismaClient } from "@/db/testClient";
import { seedInitialAdmin } from "./seedInitialAdmin";
import type { PrismaClient } from "@prisma/client";

describe("seedInitialAdmin", () => {
  let db: PrismaClient;
  beforeEach(async () => {
    db = await createTestPrismaClient();
  });

  it("creates the admin row on first run", async () => {
    await seedInitialAdmin(db, "owner@gmail.com");
    const admins = await db.adminUser.findMany();
    expect(admins).toHaveLength(1);
    expect(admins[0].email).toBe("owner@gmail.com");
  });

  it("is idempotent — running twice does not duplicate", async () => {
    await seedInitialAdmin(db, "owner@gmail.com");
    await seedInitialAdmin(db, "owner@gmail.com");
    const admins = await db.adminUser.findMany();
    expect(admins).toHaveLength(1);
  });
});
