import type { Env } from "@/env";

export interface SearchResult {
  title: string;
  url: string;
  snippet: string;
}

// Google's Custom Search JSON API is closed to new customers and fully
// shuts down 2027-01-01 — using Tavily instead, which is purpose-built for
// feeding LLM summarization (exactly this job's use case) and has an
// ongoing free tier, not a sunset one.
export async function searchWeb(query: string, env: Env): Promise<SearchResult[]> {
  const res = await fetch("https://api.tavily.com/search", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${env.TAVILY_API_KEY}`,
    },
    body: JSON.stringify({ query, max_results: 3 }),
  });
  if (!res.ok) throw new Error(`Search API returned ${res.status}`);
  const data = await res.json();
  return (data.results ?? []).map((item: { title: string; url: string; content: string }) => ({
    title: item.title,
    url: item.url,
    snippet: item.content,
  }));
}
