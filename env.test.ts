import { describe, it, expect, beforeEach } from "vitest";
import { getEnv } from "./env";

describe("getEnv", () => {
  const REAL_ENV = process.env;

  beforeEach(() => {
    process.env = { ...REAL_ENV };
  });

  it("throws listing missing vars when env is incomplete", () => {
    process.env = { NODE_ENV: "test" };
    expect(() => getEnv()).toThrow(/DATABASE_URL/);
  });

  it("returns a typed object when all vars are present", () => {
    process.env = {
      NODE_ENV: "test",
      DATABASE_URL: "postgresql://x",
      NEXTAUTH_URL: "http://localhost:3000",
      NEXTAUTH_SECRET: "secret",
      GOOGLE_CLIENT_ID: "id",
      GOOGLE_CLIENT_SECRET: "secret",
      INITIAL_ADMIN_EMAIL: "a@b.com",
      GMAIL_REFRESH_TOKEN: "token",
      GMAIL_LABEL_ID: "label",
      GMAIL_PUBSUB_TOPIC: "topic",
      GMAIL_PUBSUB_VERIFICATION_TOKEN: "secret",
      GOOGLE_GENERATIVE_AI_API_KEY: "key",
      GROQ_API_KEY: "key",
      TAVILY_API_KEY: "key",
      BLOB_READ_WRITE_TOKEN: "token",
      CRON_SECRET: "secret",
      NEO_ID_HASH_SECRET: "pepper",
      NEO_ID_ENC_SECRET: "vault-secret",
    };
    expect(getEnv().INITIAL_ADMIN_EMAIL).toBe("a@b.com");
  });
});
