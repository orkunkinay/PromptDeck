import { describe, expect, it } from "vitest";
import {
  buildPromptPicks,
  buildPromptTree,
  duplicatePromptDocument,
  promptCommandFromResourceName,
  promptResourceName
} from "../../extensions/vscode/src/adapter";
import { parsePromptDocument } from "../core/promptDocument";
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

describe("vscode adapter tree helpers", () => {
  it("builds prompt roots with variant and non-default version children", () => {
    const paper = seedPrompts.find((prompt) => prompt.id === "paper-reading")!;
    const prompts = [
      {
        ...paper,
        versions: [
          ...paper.versions,
          {
            ...paper.versions[0],
            id: "v2",
            label: "Second",
            isDefault: false
          }
        ]
      }
    ];
    const tree = buildPromptTree(prompts);
    const paperNode = tree.find((node) => node.promptCommand === paper.command)!;
    expect(paperNode.kind).toBe("prompt");
    expect(paperNode.children.some((child) => child.kind === "variant")).toBe(true);
    expect(paperNode.children.some((child) => child.kind === "version" && child.token === `${paper.command}:v2`)).toBe(true);
    expect(paperNode.children.some((child) => child.token === `${paper.command}:${paper.defaultVersionId}`)).toBe(false);
  });

  it("round-trips prompt resource names", () => {
    const name = promptResourceName("/paper-reading");
    expect(name).toBe("paper-reading.prompt.md");
    expect(promptCommandFromResourceName(name)).toBe("/paper-reading");
  });

  it("creates a duplicate document with a copy command and no aliases", () => {
    const paper = seedPrompts.find((prompt) => prompt.id === "paper-reading")!;
    const parsed = parsePromptDocument(duplicatePromptDocument(paper, "variant body"));
    expect(parsed.command).toBe("/copy-of-paper-reading");
    expect(parsed.title).toContain("Copy");
    expect(parsed.aliases).toEqual([]);
    expect(parsed.content).toBe("variant body");
  });
});
