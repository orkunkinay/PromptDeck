import { describe, expect, it } from "vitest";
import { searchPrompts } from "../shared/search/fuzzySearch";
import { seedPrompts } from "../shared/seedPrompts";

describe("fuzzy search", () => {
  it("ranks exact command matches first", () => {
    const results = searchPrompts(seedPrompts, "/paper-reading");
    expect(results[0].prompt.command).toBe("/paper-reading");
  });

  it("finds aliases, titles, tags, and descriptions", () => {
    expect(searchPrompts(seedPrompts, "/paper")[0].prompt.id).toBe("paper-reading");
    expect(searchPrompts(seedPrompts, "chapter")[0].prompt.id).toBe("summarize-chapter");
    expect(searchPrompts(seedPrompts, "engineering")[0].prompt.id).toBe("coding-agent-prod");
  });
});
