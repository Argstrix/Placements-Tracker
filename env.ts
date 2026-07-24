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
  GROQ_API_KEY: z.string().min(1),
  GOOGLE_SEARCH_API_KEY: z.string().min(1),
  GOOGLE_SEARCH_ENGINE_ID: z.string().min(1),
  BLOB_READ_WRITE_TOKEN: z.string().min(1),
  CRON_SECRET: z.string().min(1),
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
