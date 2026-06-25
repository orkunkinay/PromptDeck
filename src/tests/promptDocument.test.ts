import { describe, expect, it } from "vitest";
import { parsePromptDocument, promptTemplate, serializePromptDocument } from "../core/promptDocument";
import type { Prompt } from "../shared/models/prompt";

const now = "2026-01-01T00:00:00.000Z";

function prompt(overrides: Partial<Prompt> = {}): Prompt {
  return {
    id: "paper-reading",
    title: "Paper Reading",
    command: "/paper-reading",
    aliases: ["/paper", "/read"],
    tags: ["research", "summarize"],
    description: "Summarize an academic paper",
    defaultVersionId: "v1",
    versions: [
      {
        id: "v1",
        promptId: "paper-reading",
        label: "Original",
        content: "Line one\n\nLine two with {{placeholder}}.",
        changelog: "Created prompt",
        createdAt: now,
        createdBy: "local user",
        isDefault: true
      }
    ],
    variants: [],
    variables: {},
    createdAt: now,
    updatedAt: now,
    usageCount: 0,
    ...overrides
  };
}

describe("prompt document format", () => {
  it("round-trips prompt metadata and default-version body", () => {
    const source = prompt();
    const parsed = parsePromptDocument(serializePromptDocument(source));
    expect(parsed).toEqual({
      command: source.command,
      title: source.title,
      aliases: source.aliases,
      tags: source.tags,
      description: source.description,
      content: source.versions[0].content
    });
  });

  it("parses bracket and comma lists", () => {
    const parsed = parsePromptDocument(`---
command: /paper-reading
aliases: [/paper, /read]
tags: research, summarize
---
Body`);
    expect(parsed.aliases).toEqual(["/paper", "/read"]);
    expect(parsed.tags).toEqual(["research", "summarize"]);
  });

  it("requires frontmatter and a non-empty command", () => {
    expect(() => parsePromptDocument("command: /missing\n---\nBody")).toThrow(/frontmatter/i);
    expect(() => parsePromptDocument(promptTemplate())).toThrow(/command/i);
  });

  it("preserves body lines that contain delimiter text", () => {
    const body = "Before\n---\nAfter";
    const parsed = parsePromptDocument(`---
command: /body
---
${body}`);
    expect(parsed.content).toBe(body);
  });
});
