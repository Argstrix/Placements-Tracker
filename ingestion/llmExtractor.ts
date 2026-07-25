import type { BaseChatModel } from "@langchain/core/language_models/chat_models";
import { ChatGoogleGenerativeAI } from "@langchain/google-genai";
import { ChatGroq } from "@langchain/groq";
import { ExtractionSchema, type ExtractionResult } from "./extractionSchema";
import type { ParsedMail } from "./parseMail";
import type { Env } from "@/env";

export interface LlmClients {
  primary: BaseChatModel;
  fallback: BaseChatModel;
}

export function buildLlmClients(env: Env): LlmClients {
  return {
    primary: new ChatGoogleGenerativeAI({
      apiKey: env.GOOGLE_GENERATIVE_AI_API_KEY,
      // Pinned model names age out: Google withdrew free-tier access to the
      // gemini-2.0-* models (they now report a free-tier limit of 0), and
      // gemini-2.5-flash isn't exposed on this key at all. The rolling
      // "-latest" alias tracks whatever the current free-tier flash model is.
      // Overridable so a future break is an env change, not a redeploy.
      model: env.GEMINI_MODEL,
      temperature: 0,
      // The fallback provider exists precisely for a dead primary. Retrying a
      // quota rejection six times (the default) just burns the serverless
      // budget before Groq ever gets a turn.
      maxRetries: 1,
    }),
    fallback: new ChatGroq({
      apiKey: env.GROQ_API_KEY,
      model: "llama-3.3-70b-versatile",
      temperature: 0,
    }),
  };
}

const SYSTEM_PROMPT = `You extract structured placement-drive information from VIT CDC placement mails.
Mails vary in format: some have labeled fields, some embed the date/venue in the subject line,
some are forwarded threads, some list Neo IDs inline. Extract what you can find; use null for
fields genuinely absent from the mail. For every non-null field, also set its confidence in
fieldConfidence to "HIGH" if the mail states it unambiguously, or "LOW" if you had to infer it
(e.g. an oddly formatted date, or a value only implied by context).

B.Tech and M.Tech drives share one mailing list but are separate drives with different packages.
Set program to "BTECH", "MTECH", or "BOTH" when the mail identifies which it targets — via the
programme name, the eligible branches, or the eligibility criteria. Treat Integrated M.Tech as
"MTECH". If the mail genuinely does not say (common for shortlist and result mails that only
name the company), return null rather than guessing; a wrong programme files the mail against
the wrong drive.

Respond with ONLY the JSON object matching the schema, no prose.`;

export async function extractWithLlm(mail: ParsedMail, clients: LlmClients): Promise<ExtractionResult> {
  const userMessage = `Subject: ${mail.subject}\nFrom: ${mail.from}\nReceived: ${mail.receivedAt.toISOString()}\n\nBody:\n${mail.bodyText}`;
  const messages = [
    { role: "system", content: SYSTEM_PROMPT },
    { role: "user", content: userMessage },
  ];

  // Tried in order by hand rather than via withFallbacks, which re-raises only
  // the FIRST error and discards the rest. That hid the real cause twice: a
  // failure reported nothing but the primary's message, so a broken fallback
  // was indistinguishable from a working one. Reporting every provider's
  // error makes a total outage diagnosable from the ingestion log alone.
  const failures: string[] = [];
  const providers: [string, BaseChatModel][] = [
    ["primary", clients.primary],
    ["fallback", clients.fallback],
  ];

  for (const [label, client] of providers) {
    try {
      return await client
        .withStructuredOutput<ExtractionResult>(ExtractionSchema, { name: "extraction" })
        .invoke(messages);
    } catch (error) {
      failures.push(`${label}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  throw new Error(`All extraction providers failed — ${failures.join(" || ")}`);
}
