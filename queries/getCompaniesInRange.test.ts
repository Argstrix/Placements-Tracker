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

  it("excludes companies visiting outside the range", async () => {
    const result = await getCompaniesInRange(db, new Date("2026-07-01"), new Date("2026-07-31"));
    expect(result.map((c) => c.name)).not.toContain("Out of Range");
  });

  it("includes a company whose visit date hasn't been announced", async () => {
    // A NULL visitDate fails any SQL range comparison, so filtering on the
    // range alone made undated drives invisible on /companies while still
    // existing everywhere else. They belong in the results, grouped separately.
    const result = await getCompaniesInRange(db, new Date("2026-07-01"), new Date("2026-07-31"));
    expect(result.map((c) => c.name).sort()).toEqual(["In Range", "No Date"]);
  });

  it("keeps undated drives visible in a range that matches no dated company", async () => {
    const result = await getCompaniesInRange(db, new Date("2026-12-01"), new Date("2026-12-31"));
    expect(result.map((c) => c.name)).toEqual(["No Date"]);
  });

  it("filters by programme while still including combined drives", async () => {
    await db.company.create({
      data: { name: "MTech Only", normalizedName: "mtech only", program: "MTECH", visitDate: new Date("2026-07-20") },
    });
    const result = await getCompaniesInRange(db, new Date("2026-07-01"), new Date("2026-07-31"), "BTECH");
    // "In Range" and "No Date" default to BOTH, so a B.Tech student sees them.
    expect(result.map((c) => c.name)).not.toContain("MTech Only");
    expect(result.map((c) => c.name)).toContain("In Range");
  });
});
