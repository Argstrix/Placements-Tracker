import { z } from "zod";

export const ExtractionSchema = z.object({
  eventType: z.enum(["REGISTRATION", "SHORTLIST_ROUND", "RESULT", "UPDATE", "GENERAL_NOTICE"]),
  companyName: z.string().nullable(),
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
  fieldConfidence: z.record(z.string(), z.enum(["HIGH", "LOW"])),
});

export type ExtractionResult = z.infer<typeof ExtractionSchema>;
