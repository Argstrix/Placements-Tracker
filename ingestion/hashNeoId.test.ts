import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { createHash } from "node:crypto";
import { hashNeoId, HASH_BYTES } from "./hashNeoId";

describe("hashNeoId", () => {
  const REAL_SECRET = process.env.NEO_ID_HASH_SECRET;
  beforeEach(() => {
    process.env.NEO_ID_HASH_SECRET = "test-pepper";
  });
  afterEach(() => {
    process.env.NEO_ID_HASH_SECRET = REAL_SECRET;
  });

  it("produces a 16-byte fingerprint", () => {
    expect(hashNeoId("23BCE1234")).toHaveLength(HASH_BYTES);
  });

  it("normalizes case and surrounding whitespace so lookup matches ingestion", () => {
    expect(hashNeoId("  23bce1234 ")).toEqual(hashNeoId("23BCE1234"));
  });

  it("distinguishes different Neo IDs", () => {
    expect(hashNeoId("23BCE1234")).not.toEqual(hashNeoId("23BCE1235"));
  });

  it("depends on the pepper, so a leaked database alone reveals nothing", () => {
    const withTestPepper = hashNeoId("23BCE1234");
    process.env.NEO_ID_HASH_SECRET = "different-pepper";
    expect(hashNeoId("23BCE1234")).not.toEqual(withTestPepper);
  });

  it("matches the leading bytes of the full hex digest it replaced", () => {
    // The migration converts stored rows with decode(substring(id_hash,1,32)),
    // so the truncated value must be a prefix of the old digest or every
    // existing shortlist would stop matching.
    const legacyHex = createHash("sha256").update("test-pepper:23BCE1234").digest("hex");
    const expected = Uint8Array.from(Buffer.from(legacyHex.slice(0, HASH_BYTES * 2), "hex"));
    expect(hashNeoId("23BCE1234")).toEqual(expected);
  });
});
