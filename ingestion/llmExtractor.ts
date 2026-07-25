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
      model: "gemini-2.0-flash",
      temperature: 0,
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
  const structuredPrimary = clients.primary.withStructuredOutput<ExtractionResult>(ExtractionSchema, {
    name: "extraction",
  });
  const structuredFallback = clients.fallback.withStructuredOutput<ExtractionResult>(ExtractionSchema, {
    name: "extraction",
  });
  const chain = structuredPrimary.withFallbacks({ fallbacks: [structuredFallback] });

  const userMessage = `Subject: ${mail.subject}\nFrom: ${mail.from}\nReceived: ${mail.receivedAt.toISOString()}\n\nBody:\n${mail.bodyText}`;

  return chain.invoke([
    { role: "system", content: SYSTEM_PROMPT },
    { role: "user", content: userMessage },
  ]);
}
