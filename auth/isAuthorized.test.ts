import { describe, it, expect, beforeEach } from "vitest";
import { createTestPrismaClient } from "@/db/testClient";
import { isAuthorized } from "./isAuthorized";
import type { PrismaClient } from "@prisma/client";

describe("isAuthorized", () => {
  let db: PrismaClient;

  beforeEach(async () => {
    db = await createTestPrismaClient();
    await db.adminUser.create({ data: { email: "owner@gmail.com" } });
  });

  it("allows a vitstudent.ac.in email as a student", async () => {
    const result = await isAuthorized("someone@vitstudent.ac.in", db);
    expect(result).toEqual({ allowed: true, role: "student" });
  });

  it("allows an allowlisted personal email as admin", async () => {
    const result = await isAuthorized("owner@gmail.com", db);
    expect(result).toEqual({ allowed: true, role: "admin" });
  });

  it("rejects an email that is neither the college domain nor allowlisted", async () => {
    const result = await isAuthorized("random@gmail.com", db);
    expect(result).toEqual({ allowed: false, role: null });
  });

  it("is case-insensitive on domain and allowlist checks", async () => {
    expect((await isAuthorized("Someone@VITSTUDENT.AC.IN", db)).allowed).toBe(true);
    expect((await isAuthorized("Owner@Gmail.com", db)).allowed).toBe(true);
  });
});
