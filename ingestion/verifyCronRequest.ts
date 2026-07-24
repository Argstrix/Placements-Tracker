import type { NextRequest } from "next/server";
import type { Env } from "@/env";

/** Vercel Cron sends `Authorization: Bearer $CRON_SECRET` automatically for
 * jobs defined in vercel.json — this rejects any request that doesn't carry
 * that exact secret, so the route can't be triggered by an arbitrary
 * internet caller. */
export function verifyCronRequest(req: NextRequest, env: Env): boolean {
  return req.headers.get("authorization") === `Bearer ${env.CRON_SECRET}`;
}
