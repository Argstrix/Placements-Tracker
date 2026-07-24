import type { PrismaClient } from "@prisma/client";
import type { Env } from "@/env";
import { ChatGoogleGenerativeAI } from "@langchain/google-genai";
import { searchWeb } from "./webSearch";
import { enrichCompany } from "./enrichCompany";

/** Fire-and-forget: runs the one-time web-enrichment job for a newly
 * created company and persists the result if it succeeds. Never throws —
 * `enrichCompany` already swallows its own failures, and this wrapper
 * doesn't await its caller either, by design (see IngestOptions.onNewCompany). */
export function enrichAndSaveCompany(
  company: { id: string; name: string },
  db: PrismaClient,
  env: Env
): void {
  const llm = new ChatGoogleGenerativeAI({
    apiKey: env.GOOGLE_GENERATIVE_AI_API_KEY,
    model: "gemini-2.0-flash",
    temperature: 0.2,
  });

  void enrichCompany(company.name, {
    search: (query) => searchWeb(query, env),
    llm,
  }).then(async (result) => {
    if (!result) return;
    await db.company.update({
      where: { id: company.id },
      data: {
        enrichmentSummary: result.summary,
        enrichmentSources: result.sources,
        enrichmentAttemptedAt: new Date(),
      },
    });
  });
}
