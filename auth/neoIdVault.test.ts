import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { encryptNeoId, decryptNeoId } from "./neoIdVault";

describe("neoIdVault", () => {
  const REAL_SECRET = process.env.NEO_ID_ENC_SECRET;
  beforeEach(() => {
    process.env.NEO_ID_ENC_SECRET = "test-vault-secret";
  });
  afterEach(() => {
    process.env.NEO_ID_ENC_SECRET = REAL_SECRET;
  });

  it("round-trips a Neo ID through encrypt and decrypt", () => {
    const blob = encryptNeoId("23bce1234");
    expect(decryptNeoId(blob)).toBe("23BCE1234");
  });

  it("produces different ciphertext for the same input each call (random IV)", () => {
    const a = encryptNeoId("23BCE1234");
    const b = encryptNeoId("23BCE1234");
    expect(a).not.toEqual(b);
    expect(decryptNeoId(a)).toBe(decryptNeoId(b));
  });

  it("fails to decrypt under a different secret", () => {
    const blob = encryptNeoId("23BCE1234");
    process.env.NEO_ID_ENC_SECRET = "different-secret";
    expect(() => decryptNeoId(blob)).toThrow();
  });

  it("fails to decrypt if the ciphertext is tampered with", () => {
    const blob = encryptNeoId("23BCE1234");
    const tampered = Uint8Array.from(blob);
    tampered[tampered.length - 1] ^= 0xff;
    expect(() => decryptNeoId(tampered)).toThrow();
  });
});
