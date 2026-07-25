import { z } from "zod";

const envSchema = z.object({
  DATABASE_URL: z.string().min(1),
  NEXTAUTH_URL: z.string().min(1),
  NEXTAUTH_SECRET: z.string().min(1),
  GOOGLE_CLIENT_ID: z.string().min(1),
  GOOGLE_CLIENT_SECRET: z.string().min(1),
  INITIAL_ADMIN_EMAIL: z.string().email(),
  GMAIL_REFRESH_TOKEN: z.string().min(1),
  GMAIL_LABEL_ID: z.string().min(1),
  GMAIL_PUBSUB_TOPIC: z.string().min(1),
  GMAIL_PUBSUB_VERIFICATION_TOKEN: z.string().min(1),
  GOOGLE_GENERATIVE_AI_API_KEY: z.string().min(1),
  // Rolling alias rather than a pinned version: Google withdrew free-tier
  // access to gemini-2.0-* (now reporting a free-tier limit of 0), so a pinned
  // name silently becomes dead weight. Overridable without a redeploy.
  GEMINI_MODEL: z.string().min(1).default("gemini-flash-latest"),
  GROQ_API_KEY: z.string().min(1),
  TAVILY_API_KEY: z.string().min(1),
  BLOB_READ_WRITE_TOKEN: z.string().min(1),
  CRON_SECRET: z.string().min(1),
  // Secret pepper for hashing Neo IDs. Neo IDs are never stored in plaintext —
  // only salted with this value and hashed — so this must be set and kept secret.
  NEO_ID_HASH_SECRET: z.string().min(1),

  // Storage-reclamation tunables. Unlike everything above these are optional:
  // the defaults are the intended operating values, and an unset variable must
  // not be a startup failure.
  // Only mail received strictly after this instant is ingested. Guards the
  // first Pub/Sub push from pulling in the entire label history — placements
  // for this batch start in June 2026, so anything older is a different batch's
  // data we have no business publishing.
  INGEST_AFTER: z.coerce.date().default(new Date("2026-05-31T23:59:59.999Z")),

  RETIRE_AFTER_RESULT_DAYS: z.coerce.number().int().positive().default(30),
  RETIRE_AFTER_IDLE_DAYS: z.coerce.number().int().positive().default(120),
  RECLAIM_BATCH_SIZE: z.coerce.number().int().positive().default(200),
});

export type Env = z.infer<typeof envSchema>;

export function getEnv(): Env {
  const parsed = envSchema.safeParse(process.env);
  if (!parsed.success) {
    const missing = parsed.error.issues.map((i) => i.path.join(".")).join(", ");
    throw new Error(
      `Missing/invalid environment variables: ${missing}. Copy .env.example to .env.local and fill in real values.`
    );
  }
  return parsed.data;
}
