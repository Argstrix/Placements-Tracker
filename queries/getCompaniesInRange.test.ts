import { describe, it, expect, beforeEach } from "vitest";
import { createTestPrismaClient } from "@/db/testClient";
import { getCompaniesInRange } from "./getCompaniesInRange";
import type { PrismaClient } from "@prisma/client";

describe("getCompaniesInRange", () => {
  let db: PrismaClient;
  beforeEach(async () => {
    db = await createTestPrismaClient();
    await db.company.createMany({
      data: [
        { name: "In Range", normalizedName: "in range", visitDate: new Date("2026-07-15") },
        { name: "Out of Range", normalizedName: "out of range", visitDate: new Date("2026-09-01") },
        { name: "No Date", normalizedName: "no date", visitDate: null },
      ],
    });
  });

  it("returns only companies with a visitDate inside the given range", async () => {
    const result = await getCompaniesInRange(db, new Date("2026-07-01"), new Date("2026-07-31"));
    expect(result.map((c) => c.name)).toEqual(["In Range"]);
  });
});
