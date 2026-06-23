import { describe, expect, it } from "vitest";
import { buildPromptPicks } from "../../extensions/vscode/src/adapter";
import { seedPrompts } from "../shared/seedPrompts";

describe("vscode adapter buildPromptPicks", () => {
  const picks = buildPromptPicks(seedPrompts);

  it("includes a default pick for every prompt", () => {
    for (const prompt of seedPrompts) {
      expect(picks.some((pick) => pick.token === prompt.command)).toBe(true);
    }
  });

  it("adds an addressable pick for each variant", () => {
    const paper = seedPrompts.find((prompt) => prompt.id === "paper-reading")!;
    const variant = paper.variants[0];
    const pick = picks.find((candidate) => candidate.token === `${paper.command}:${variant.suffix}`);
    expect(pick).toBeTruthy();
    expect(pick?.label).toBe(`${paper.command}:${variant.suffix}`);
    expect(pick?.description).toContain(paper.title);
  });

  it("does not add a pick for the default version", () => {
    const paper = seedPrompts.find((prompt) => prompt.id === "paper-reading")!;
    expect(picks.some((pick) => pick.token === `${paper.command}:${paper.defaultVersionId}`)).toBe(false);
  });
});
