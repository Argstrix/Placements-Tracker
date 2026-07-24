import type { BaseChatModel } from "@langchain/core/language_models/chat_models";
import type { SearchResult } from "./webSearch";

export interface EnrichmentResult {
  summary: string;
  sources: string[];
}

export interface EnrichDeps {
  search: (query: string) => Promise<SearchResult[]>;
  llm: BaseChatModel;
}

// Best-effort only: any failure anywhere in this job returns null rather
// than throwing, since enrichment must never block or retry-pressure the
// core mail-derived data it's attached to.
export async function enrichCompany(companyName: string, deps: EnrichDeps): Promise<EnrichmentResult | null> {
  try {
    const results = await deps.search(`${companyName} company`);
    if (results.length === 0) return null;

    const context = results.map((r) => `${r.title}: ${r.snippet} (${r.url})`).join("\n");
    const prompt = `Based on these search results, write a 1-2 sentence neutral summary of what "${companyName}" does as a company. Results:\n${context}`;
    const response = await deps.llm.invoke(prompt);
    const summary = typeof response.content === "string" ? response.content : String(response.content);

    return { summary, sources: results.map((r) => r.url) };
  } catch {
    return null;
  }
}
