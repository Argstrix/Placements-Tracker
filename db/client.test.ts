import { describe, it, expect } from "vitest";
import { createTestPrismaClient } from "./testClient";

describe("test database", () => {
  it("applies the schema and allows a round-trip write/read", async () => {
    const db = await createTestPrismaClient();
    const company = await db.company.create({
      data: { name: "Acme Corp", normalizedName: "acme corp" },
    });
    const found = await db.company.findUnique({ where: { id: company.id } });
    expect(found?.name).toBe("Acme Corp");
    await db.$disconnect();
  });
});
