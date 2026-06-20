import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Prompt } from "../shared/models/prompt";
import { seedPrompts } from "../shared/seedPrompts";
import { db } from "../shared/storage/db";
import { createPromptFromCommand, promptRepository } from "../shared/storage/promptRepository";

const describeWithIndexedDb = "indexedDB" in globalThis ? describe : describe.skip;

function testPrompt(id: string, command: string, aliases: string[] = []): Prompt {
  return {
    ...createPromptFromCommand(command),
    id,
    title: id,
    aliases,
    versions: [
      {
        id: "v1",
        promptId: id,
        label: "Original",
        content: `Body for ${id}`,
        changelog: "Created prompt",
        createdAt: "2026-01-01T00:00:00.000Z",
        createdBy: "local user",
        isDefault: true
      }
    ],
    variants: [],
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    usageCount: 0
  };
}

describeWithIndexedDb("prompt repository storage hardening", () => {
  beforeEach(async () => {
    vi.mocked(chrome.storage.local.set).mockClear();
    db.close();
    await db.delete();
    await db.open();
  });

  it("does not duplicate seed prompts under concurrent ensureSeeded calls", async () => {
    await Promise.all(Array.from({ length: 8 }, () => promptRepository.ensureSeeded()));

    expect(await db.prompts.count()).toBe(seedPrompts.length);
    expect(await db.meta.get("seeded")).toMatchObject({ key: "seeded", value: true });
  });

  it("rejects concurrent command collisions atomically", async () => {
    const first = testPrompt("first", "/same");
    const second = testPrompt("second", "/same");

    const results = await Promise.allSettled([
      promptRepository.save(first, { minorEdit: true }),
      promptRepository.save(second, { minorEdit: true })
    ]);

    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    expect(results.filter((result) => result.status === "rejected")).toHaveLength(1);
    expect(await db.prompts.where("commandTokens").equals("/same").count()).toBe(1);
  });

  it("checks alias and command collisions through the command token index", async () => {
    await promptRepository.save(testPrompt("first", "/first", ["/shared"]), { minorEdit: true });

    await expect(promptRepository.save(testPrompt("second", "/shared"), { minorEdit: true })).rejects.toThrow(
      /Command collision/
    );
  });

  it("sums concurrent recordUsage calls", async () => {
    const prompt = await promptRepository.save(testPrompt("usage", "/usage"), { minorEdit: true });

    await Promise.all(Array.from({ length: 25 }, () => promptRepository.recordUsage(prompt.id, "example.com")));

    const saved = await promptRepository.get(prompt.id);
    expect(saved?.usageCount).toBe(25);
    expect(saved?.useCount).toBe(25);
    expect(saved?.hostUseStats?.["example.com"].useCount).toBe(25);
  });
});
