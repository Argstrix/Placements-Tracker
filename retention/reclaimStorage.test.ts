import { describe, it, expect, beforeEach, vi } from "vitest";
import { createTestPrismaClient } from "@/db/testClient";
import { reclaimStorage } from "./reclaimStorage";
import { purgeRetiredCompanyBlobs } from "./purgeRetiredBlobs";
import { DEFAULT_THRESHOLDS } from "./retirementPredicate";
import type { MailEventType, PrismaClient } from "@prisma/client";

const NOW = new Date("2026-07-25T00:00:00Z");
const DAY_MS = 24 * 60 * 60 * 1000;

function daysAgo(n: number): Date {
  return new Date(NOW.getTime() - n * DAY_MS);
}

let seq = 0;

/** A company with one mail event carrying `attachments` stored files. */
async function seedCompany(
  db: PrismaClient,
  opts: { name: string; type: MailEventType; daysAgo: number; attachments: number; retiredAt?: Date }
) {
  const company = await db.company.create({
    data: {
      name: opts.name,
      normalizedName: opts.name.toLowerCase(),
      retiredAt: opts.retiredAt ?? null,
    },
  });
  const mailEvent = await db.mailEvent.create({
    data: {
      type: opts.type,
      subject: `${opts.name} mail`,
      sender: "cdc@vitstudent.ac.in",
      receivedAt: daysAgo(opts.daysAgo),
      gmailMessageId: `gmail-${(seq += 1)}`,
      bodyText: "body",
      companyId: company.id,
    },
  });
  for (let i = 0; i < opts.attachments; i += 1) {
    await db.attachment.create({
      data: {
        mailEventId: mailEvent.id,
        filename: `jd-${i}.pdf`,
        mimeType: "application/pdf",
        blobUrl: `https://blob.example/${company.id}-${i}.pdf`,
      },
    });
  }
  return company;
}

describe("reclaimStorage", () => {
  let db: PrismaClient;
  beforeEach(async () => {
    db = await createTestPrismaClient();
    seq = 0;
  });

  it("retires a finished drive and deletes its files in the same run", async () => {
    const finished = await seedCompany(db, { name: "Wakefit", type: "RESULT", daysAgo: 40, attachments: 2 });
    const deleteBlob = vi.fn(async () => {});

    const result = await reclaimStorage({
      db,
      now: NOW,
      thresholds: DEFAULT_THRESHOLDS,
      deleteBlob,
      batchSize: 200,
    });

    expect(result.retired).toBe(1);
    expect(result.attachmentsPurged).toBe(2);
    expect(result.companiesCompleted).toBe(1);
    expect(deleteBlob).toHaveBeenCalledTimes(2);

    const after = await db.company.findUniqueOrThrow({ where: { id: finished.id } });
    expect(after.retiredAt).not.toBeNull();
    expect(after.purgedAt).not.toBeNull();
  });

  it("leaves a tombstone rather than deleting the attachment row", async () => {
    await seedCompany(db, { name: "Wakefit", type: "RESULT", daysAgo: 40, attachments: 1 });

    await reclaimStorage({ db, now: NOW, thresholds: DEFAULT_THRESHOLDS, deleteBlob: async () => {}, batchSize: 200 });

    const attachments = await db.attachment.findMany();
    expect(attachments).toHaveLength(1);
    expect(attachments[0].blobUrl).toBeNull();
    expect(attachments[0].purgedAt).toEqual(NOW);
    // The record that a JD existed survives, so the timeline can say so.
    expect(attachments[0].filename).toBe("jd-0.pdf");
  });

  it("never touches a company whose drive is still live", async () => {
    await seedCompany(db, { name: "Infosys", type: "REGISTRATION", daysAgo: 5, attachments: 1 });
    const deleteBlob = vi.fn(async () => {});

    const result = await reclaimStorage({
      db,
      now: NOW,
      thresholds: DEFAULT_THRESHOLDS,
      deleteBlob,
      batchSize: 200,
    });

    expect(result.retired).toBe(0);
    expect(deleteBlob).not.toHaveBeenCalled();
    const attachments = await db.attachment.findMany();
    expect(attachments[0].blobUrl).not.toBeNull();
  });

  it("keeps every company, mail event and shortlist hash", async () => {
    const company = await seedCompany(db, { name: "Wakefit", type: "RESULT", daysAgo: 40, attachments: 1 });
    const mailEvent = await db.mailEvent.findFirstOrThrow({ where: { companyId: company.id } });
    await db.shortlistHash.create({
      data: { idHash: Buffer.alloc(16, 7), round: "Final", mailEventId: mailEvent.id },
    });

    await reclaimStorage({ db, now: NOW, thresholds: DEFAULT_THRESHOLDS, deleteBlob: async () => {}, batchSize: 200 });

    expect(await db.company.count()).toBe(1);
    expect(await db.mailEvent.count()).toBe(1);
    expect(await db.shortlistHash.count()).toBe(1);
    // Body text survives — the site's disclaimer depends on it.
    expect((await db.mailEvent.findFirstOrThrow()).bodyText).toBe("body");
  });

  it("is a no-op on a second run", async () => {
    await seedCompany(db, { name: "Wakefit", type: "RESULT", daysAgo: 40, attachments: 2 });
    const deleteBlob = vi.fn(async () => {});
    const opts = { db, now: NOW, thresholds: DEFAULT_THRESHOLDS, deleteBlob, batchSize: 200 };

    await reclaimStorage(opts);
    const second = await reclaimStorage(opts);

    expect(second.retired).toBe(0);
    expect(second.attachmentsPurged).toBe(0);
    expect(deleteBlob).toHaveBeenCalledTimes(2);
  });

  it("stops at the batch size and finishes the rest on the next run", async () => {
    await seedCompany(db, { name: "Wakefit", type: "RESULT", daysAgo: 40, attachments: 5 });
    const deleteBlob = vi.fn(async () => {});

    const first = await reclaimStorage({
      db,
      now: NOW,
      thresholds: DEFAULT_THRESHOLDS,
      deleteBlob,
      batchSize: 2,
    });
    expect(first.attachmentsPurged).toBe(2);
    // Files remain, so the company must not be marked done yet.
    expect(first.companiesCompleted).toBe(0);

    const second = await reclaimStorage({
      db,
      now: NOW,
      thresholds: DEFAULT_THRESHOLDS,
      deleteBlob,
      batchSize: 200,
    });
    expect(second.attachmentsPurged).toBe(3);
    expect(second.companiesCompleted).toBe(1);
    expect(await db.attachment.count({ where: { blobUrl: { not: null } } })).toBe(0);
  });

  it("leaves a consistent state when blob deletion fails partway through", async () => {
    await seedCompany(db, { name: "Wakefit", type: "RESULT", daysAgo: 40, attachments: 3 });
    let calls = 0;
    const flaky = vi.fn(async () => {
      calls += 1;
      if (calls === 2) throw new Error("blob storage unavailable");
    });

    const result = await purgeRetiredCompanyBlobs({
      db,
      now: NOW,
      deleteBlob: flaky,
      batchSize: 200,
    });
    // Nothing to purge yet — the company hasn't been retired in this test.
    expect(result.attachmentsPurged).toBe(0);

    await db.company.updateMany({ data: { retiredAt: daysAgo(1) } });
    const attempted = await purgeRetiredCompanyBlobs({ db, now: NOW, deleteBlob: flaky, batchSize: 200 });

    expect(attempted.failures).toBe(1);
    expect(attempted.attachmentsPurged).toBe(2);
    // A failure must not let the company be stamped complete, or the surviving
    // file would be orphaned in storage forever.
    expect(attempted.companiesCompleted).toBe(0);
    expect((await db.company.findFirstOrThrow()).purgedAt).toBeNull();

    // The next run picks up exactly what was left behind.
    const rerun = await purgeRetiredCompanyBlobs({ db, now: NOW, deleteBlob: async () => {}, batchSize: 200 });
    expect(rerun.attachmentsPurged).toBe(1);
    expect(rerun.companiesCompleted).toBe(1);
  });
});
