import { describe, it, expect } from "vitest";
import { FakeListChatModel } from "@langchain/core/utils/testing";
import { enrichCompany } from "./enrichCompany";
import type { BaseChatModel } from "@langchain/core/language_models/chat_models";

describe("enrichCompany", () => {
  it("returns a summary and source URLs on success", async () => {
    const search = async () => [
      { title: "Wakefit - About", url: "https://wakefit.co/about", snippet: "Wakefit is a home and sleep solutions company." },
    ];
    const llm = new FakeListChatModel({ responses: ["Wakefit is an Indian home and sleep solutions company."] });
    const result = await enrichCompany("Wakefit", { search, llm });
    expect(result?.summary).toContain("Wakefit");
    expect(result?.sources).toEqual(["https://wakefit.co/about"]);
  });

  it("returns null instead of throwing when the search fails", async () => {
    const search = async (): Promise<never> => {
      throw new Error("search API down");
    };
    const llm = new FakeListChatModel({ responses: ["unused"] });
    const result = await enrichCompany("Wakefit", { search, llm });
    expect(result).toBeNull();
  });

  it("returns null instead of throwing when the LLM fails", async () => {
    const search = async () => [{ title: "x", url: "https://x.com", snippet: "y" }];
    const llm = { invoke: async () => { throw new Error("llm down"); } } as unknown as BaseChatModel;
    const result = await enrichCompany("Wakefit", { search, llm });
    expect(result).toBeNull();
  });

  it("returns null when the search yields no results, without calling the LLM", async () => {
    const search = async () => [];
    let llmCalled = false;
    const llm = { invoke: async () => { llmCalled = true; return { content: "unused" }; } } as unknown as BaseChatModel;
    const result = await enrichCompany("Wakefit", { search, llm });
    expect(result).toBeNull();
    expect(llmCalled).toBe(false);
  });
});
