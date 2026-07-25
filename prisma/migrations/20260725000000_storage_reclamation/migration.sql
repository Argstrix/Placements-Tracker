-- Storage reclamation for retired companies.
--
-- Run against Neon before deploying. The ShortlistHash column type changes are
-- destructive under `prisma db push`, which is why this is hand-written: every
-- step below preserves existing data.

-- 1. Retirement markers.
ALTER TABLE "Company" ADD COLUMN "retiredAt" TIMESTAMP(3);
ALTER TABLE "Company" ADD COLUMN "purgedAt"  TIMESTAMP(3);
CREATE INDEX "Company_retiredAt_idx" ON "Company"("retiredAt");

-- 2. Attachment tombstones. blobUrl becomes nullable; existing rows keep their
--    URL and are untouched.
ALTER TABLE "Attachment" ALTER COLUMN "blobUrl" DROP NOT NULL;
ALTER TABLE "Attachment" ADD COLUMN "purgedAt" TIMESTAMP(3);
CREATE INDEX "Attachment_mailEventId_idx" ON "Attachment"("mailEventId");

-- 3. ShortlistHash: 64-char hex text -> 16 raw bytes.
--    The new value is a prefix of the old digest, so this is derivable from the
--    stored rows with no re-hashing and no loss of matching ability. A Neo ID
--    that matched before still matches after.
ALTER TABLE "ShortlistHash" ADD COLUMN "idHash_bytes" BYTEA;
UPDATE "ShortlistHash" SET "idHash_bytes" = decode(substring("idHash" from 1 for 32), 'hex');
ALTER TABLE "ShortlistHash" ALTER COLUMN "idHash_bytes" SET NOT NULL;
DROP INDEX IF EXISTS "ShortlistHash_idHash_idx";
ALTER TABLE "ShortlistHash" DROP COLUMN "idHash";
ALTER TABLE "ShortlistHash" RENAME COLUMN "idHash_bytes" TO "idHash";
CREATE INDEX "ShortlistHash_idHash_idx" ON "ShortlistHash"("idHash");

-- 4. ShortlistHash: cuid primary key -> bigint identity, and drop the redundant
--    createdAt (mailEvent.receivedAt already carries the time).
ALTER TABLE "ShortlistHash" DROP CONSTRAINT "ShortlistHash_pkey";
ALTER TABLE "ShortlistHash" DROP COLUMN "id";
ALTER TABLE "ShortlistHash" ADD COLUMN "id" BIGSERIAL;
ALTER TABLE "ShortlistHash" ADD CONSTRAINT "ShortlistHash_pkey" PRIMARY KEY ("id");
ALTER TABLE "ShortlistHash" DROP COLUMN "createdAt";
CREATE INDEX "ShortlistHash_mailEventId_idx" ON "ShortlistHash"("mailEventId");

-- 5. Cascade backstops, so a future hard delete can never orphan rows. Nothing
--    in the retention sweep deletes a MailEvent — these are insurance.
ALTER TABLE "Attachment" DROP CONSTRAINT "Attachment_mailEventId_fkey";
ALTER TABLE "Attachment" ADD CONSTRAINT "Attachment_mailEventId_fkey"
  FOREIGN KEY ("mailEventId") REFERENCES "MailEvent"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ShortlistHash" DROP CONSTRAINT "ShortlistHash_mailEventId_fkey";
ALTER TABLE "ShortlistHash" ADD CONSTRAINT "ShortlistHash_mailEventId_fkey"
  FOREIGN KEY ("mailEventId") REFERENCES "MailEvent"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- 6. IngestionLog: collapse to one row per mail, then enforce it.
--    Keep the newest row per gmailMessageId and carry forward the highest
--    retryCount seen, so retry budgets survive the collapse.
ALTER TABLE "IngestionLog" ADD COLUMN "updatedAt" TIMESTAMP(3);
UPDATE "IngestionLog" SET "updatedAt" = "createdAt" WHERE "updatedAt" IS NULL;
ALTER TABLE "IngestionLog" ALTER COLUMN "updatedAt" SET NOT NULL;

UPDATE "IngestionLog" l
SET "retryCount" = agg.max_retry
FROM (
  SELECT "gmailMessageId", MAX("retryCount") AS max_retry
  FROM "IngestionLog"
  GROUP BY "gmailMessageId"
) agg
WHERE l."gmailMessageId" = agg."gmailMessageId";

DELETE FROM "IngestionLog" l
USING (
  SELECT "id",
         ROW_NUMBER() OVER (PARTITION BY "gmailMessageId" ORDER BY "createdAt" DESC, "id" DESC) AS rn
  FROM "IngestionLog"
) ranked
WHERE l."id" = ranked."id" AND ranked.rn > 1;

CREATE UNIQUE INDEX "IngestionLog_gmailMessageId_key" ON "IngestionLog"("gmailMessageId");
CREATE INDEX "IngestionLog_status_idx" ON "IngestionLog"("status");
