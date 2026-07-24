import { describe, it, expect } from "vitest";
import { NextRequest } from "next/server";
import { verifyCronRequest } from "./verifyCronRequest";
import type { Env } from "@/env";

const env = { CRON_SECRET: "the-real-secret" } as Env;

describe("verifyCronRequest", () => {
  it("accepts a request with the correct bearer token", () => {
    const req = new NextRequest("http://localhost/api/cron/renew-watch", {
      headers: { authorization: "Bearer the-real-secret" },
    });
    expect(verifyCronRequest(req, env)).toBe(true);
  });

  it("rejects a request with no authorization header", () => {
    const req = new NextRequest("http://localhost/api/cron/renew-watch");
    expect(verifyCronRequest(req, env)).toBe(false);
  });

  it("rejects a request with the wrong token", () => {
    const req = new NextRequest("http://localhost/api/cron/renew-watch", {
      headers: { authorization: "Bearer wrong" },
    });
    expect(verifyCronRequest(req, env)).toBe(false);
  });
});
