import { describe, it, expect } from "vitest";
import { z } from "zod";
import { ExtractionSchema } from "./extractionSchema";

/**
 * Keywords Gemini accepts in `generation_config.response_schema`, which is an
 * OpenAPI 3.0 Schema subset rather than full JSON Schema.
 */
const GEMINI_SUPPORTED = new Set([
  "type",
  "format",
  "description",
  "nullable",
  "enum",
  "maxItems",
  "minItems",
  "properties",
  "required",
  "items",
  "anyOf",
  "propertyOrdering",
  "title",
]);

/**
 * Stripped by @langchain/google-genai before the request is sent — see
 * removeAdditionalProperties in its zod_to_genai_parameters module. Emitting
 * these is harmless; anything else outside GEMINI_SUPPORTED reaches the API
 * and comes back as a 400.
 */
const STRIPPED_BY_ADAPTER = new Set(["additionalProperties", "$schema", "strict"]);

function unsupportedKeywords(node: unknown, path = "$", found: string[] = []): string[] {
  if (!node || typeof node !== "object") return found;
  if (Array.isArray(node)) {
    node.forEach((child, i) => unsupportedKeywords(child, `${path}[${i}]`, found));
    return found;
  }
  for (const [key, value] of Object.entries(node as Record<string, unknown>)) {
    if (STRIPPED_BY_ADAPTER.has(key)) continue;
    if (!GEMINI_SUPPORTED.has(key)) found.push(`${path}.${key}`);
    if (key === "properties" && value && typeof value === "object") {
      for (const [name, sub] of Object.entries(value as Record<string, unknown>)) {
        unsupportedKeywords(sub, `${path}.properties.${name}`, found);
      }
    } else if (value && typeof value === "object") {
      unsupportedKeywords(value, `${path}.${key}`, found);
    }
  }
  return found;
}

describe("ExtractionSchema", () => {
  it("generates a schema Gemini's response_schema will accept", () => {
    // Regression guard for a 400 that took down every LLM extraction: an open
    // z.record() emits `propertyNames`, which Gemini rejects outright and the
    // LangChain adapter does not strip.
    const json = z.toJSONSchema(ExtractionSchema, { io: "output" });
    expect(unsupportedKeywords(json)).toEqual([]);
  });

  it("accepts a realistic extraction with per-field confidence", () => {
    const parsed = ExtractionSchema.parse({
      eventType: "REGISTRATION",
      companyName: "Wakefit",
      category: "Super Dream",
      campuses: ["Vellore"],
      visitDate: "2026-08-01",
      eligibleBranches: ["CSE"],
      eligibilityCriteria: "CGPA 7.0+",
      ctc: "12 LPA",
      stipend: null,
      venue: null,
      instructions: null,
      website: null,
      fieldConfidence: { companyName: "HIGH", visitDate: "LOW" },
    });
    expect(parsed.fieldConfidence.visitDate).toBe("LOW");
  });

  it("allows an empty confidence map for the regex fast path", () => {
    const parsed = ExtractionSchema.parse({
      eventType: "GENERAL_NOTICE",
      companyName: null,
      category: null,
      campuses: [],
      visitDate: null,
      eligibleBranches: [],
      eligibilityCriteria: null,
      ctc: null,
      stipend: null,
      venue: null,
      instructions: null,
      website: null,
      fieldConfidence: {},
    });
    expect(parsed.fieldConfidence).toEqual({});
  });
});
