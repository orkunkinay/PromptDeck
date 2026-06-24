import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { PromptLibrary } from "../core/library";
import { createBackup } from "../shared/backup";
import { seedPrompts } from "../shared/seedPrompts";
import type { Prompt } from "../shared/models/prompt";

let tmpDir: string;
let libPath: string;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "promptdeck-lib-"));
  libPath = path.join(tmpDir, "library.json");
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

function newPrompt(id: string, command: string): Prompt {
  const now = "2026-01-01T00:00:00.000Z";
  return {
    id,
    title: id,
    command,
    aliases: [],
    tags: [],
    description: "",
    defaultVersionId: "v1",
    versions: [{ id: "v1", promptId: id, label: "Original", content: `body ${id}`, changelog: "", createdAt: now, createdBy: "local user", isDefault: true }],
    variants: [],
    variables: {},
    createdAt: now,
    updatedAt: now,
    usageCount: 0
  };
}

describe("PromptLibrary", () => {
  it("lists seeded prompts on first use", () => {
    const library = new PromptLibrary({ path: libPath });
    expect(library.list().length).toBe(seedPrompts.length);
  });

  it("imports a backup and exposes the new prompt", () => {
    const library = new PromptLibrary({ path: libPath });
    const backup = createBackup([newPrompt("commit-message", "/commit-message")]);
    const result = library.importBackup(backup, "merge-safe");
    expect(result.importedPromptCount).toBe(1);
    expect(library.resolve("/commit-message")?.resolved.content).toBe("body commit-message");
  });

  it("round-trips through export and import into a fresh library", () => {
    const source = new PromptLibrary({ path: libPath });
    source.importBackup(createBackup([newPrompt("a", "/a")]), "merge-safe");
    const exported = JSON.parse(source.exportBackupString());

    const targetPath = path.join(tmpDir, "target.json");
    const target = new PromptLibrary({ path: targetPath, seed: false });
    target.importBackup(exported, "replace");
    expect(target.list().some((prompt) => prompt.command === "/a")).toBe(true);
  });

  it("records usage by incrementing usageCount", () => {
    const library = new PromptLibrary({ path: libPath });
    const id = library.list()[0].id;
    library.recordUsage(id);
    expect(library.list().find((prompt) => prompt.id === id)?.usageCount).toBe(1);
  });

  it("reports doctor info", () => {
    const library = new PromptLibrary({ path: libPath });
    const report = library.doctor();
    expect(report.libraryPath).toBe(libPath);
    expect(report.promptCount).toBe(seedPrompts.length);
    expect(report.schemaVersion).toBe(1);
  });

  it("rejects an invalid backup", () => {
    const library = new PromptLibrary({ path: libPath });
    expect(() => library.importBackup({ kind: "nope" }, "merge-safe")).toThrow();
  });

  it("adds, edits, and removes a prompt with collision enforcement", () => {
    const library = new PromptLibrary({ path: libPath, seed: false });
    const added = library.addPrompt({ command: "standup", content: "Standup for {{day}}", aliases: ["su"] });
    expect(added.command).toBe("/standup");
    expect(Object.keys(added.variables)).toContain("day");

    // Collision on the alias is rejected.
    expect(() => library.addPrompt({ command: "other", aliases: ["su"] })).toThrow(/collision/i);

    const edited = library.updatePrompt("standup", { content: "New body", description: "Daily" });
    expect(edited.versions.length).toBe(2);
    expect(edited.description).toBe("Daily");

    const inPlace = library.updatePrompt("standup", { content: "Patched", minor: true });
    expect(inPlace.versions.length).toBe(2);
    expect(library.resolve("standup")?.resolved.content).toBe("Patched");

    const removed = library.removePrompt("su");
    expect(removed.id).toBe("standup");
    expect(library.list()).toHaveLength(0);
  });

  it("plans an import without writing", () => {
    const library = new PromptLibrary({ path: libPath, seed: false });
    const backup = createBackup([newPrompt("x", "/x")]);
    const { plan } = library.planImport(backup);
    expect(plan.summary.newPromptCount).toBe(1);
    expect(library.list()).toHaveLength(0); // unchanged
  });
});
