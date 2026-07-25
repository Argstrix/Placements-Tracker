import { z } from "zod";

const Confidence = z.enum(["HIGH", "LOW"]);

/**
 * Per-field confidence, keyed explicitly rather than as an open z.record().
 *
 * A record emits `propertyNames` into the generated JSON Schema, and Gemini's
 * response_schema — an OpenAPI 3.0 subset — rejects the whole request with a
 * 400 when it sees that keyword. The LangChain adapter strips
 * `additionalProperties` and `$schema` but not `propertyNames`, so an open
 * record broke every LLM extraction. Naming the keys is also more honest: they
 * were only ever the extraction fields below.
 *
 * Every key is optional — the regex fast path supplies none of them, and the
 * model only reports confidence for fields it actually found.
 */
const FieldConfidenceSchema = z.object({
  companyName: Confidence.optional(),
  category: Confidence.optional(),
  campuses: Confidence.optional(),
  visitDate: Confidence.optional(),
  eligibleBranches: Confidence.optional(),
  eligibilityCriteria: Confidence.optional(),
  ctc: Confidence.optional(),
  stipend: Confidence.optional(),
  venue: Confidence.optional(),
  instructions: Confidence.optional(),
  website: Confidence.optional(),
});

export const ExtractionSchema = z.object({
  eventType: z.enum(["REGISTRATION", "SHORTLIST_ROUND", "RESULT", "UPDATE", "GENERAL_NOTICE"]),
  companyName: z.string().nullable(),
  // Nullable on purpose: a follow-up mail that never says which programme it
  // concerns must report that honestly rather than have the model pick one.
  program: z.enum(["BTECH", "MTECH", "BOTH"]).nullable(),
  category: z.string().nullable(),
  campuses: z.array(z.string()),
  visitDate: z.string().nullable(),
  eligibleBranches: z.array(z.string()),
  eligibilityCriteria: z.string().nullable(),
  ctc: z.string().nullable(),
  stipend: z.string().nullable(),
  venue: z.string().nullable(),
  instructions: z.string().nullable(),
  website: z.string().nullable(),
  fieldConfidence: FieldConfidenceSchema,
});

export type ExtractionResult = z.infer<typeof ExtractionSchema>;
export type FieldConfidence = z.infer<typeof FieldConfidenceSchema>;
