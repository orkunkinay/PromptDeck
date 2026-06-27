import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { PromptLibrary } from "../core";
import { handleManagerRequest, type ManagerBridgeDependencies } from "../../extensions/vscode/src/managerBridge";

let tmpDir: string;
let refreshCount = 0;
let inserted: string[] = [];
let copied: string[] = [];

function deps(libraryPath: string): ManagerBridgeDependencies {
  return {
    openLibrary: () => new PromptLibrary({ path: libraryPath, seed: false }),
    refreshTree: () => {
      refreshCount += 1;
    },
    insertPrompt: async (token) => {
      inserted.push(token);
    },
    copyPrompt: async (token) => {
      copied.push(token);
    },
    openLibraryFile: async () => undefined
  };
}

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "promptdeck-vscode-manager-"));
  refreshCount = 0;
  inserted = [];
  copied = [];
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe("VS Code manager bridge", () => {
  it("creates, saves, duplicates, and deletes prompts through the file library", async () => {
    const libraryPath = path.join(tmpDir, "library.json");
    const bridge = deps(libraryPath);

    const created = await handleManagerRequest({ id: "1", type: "PROMPT_CREATE" }, bridge);
    expect((created as { command: string }).command).toBe("/new-prompt");

    const prompt = { ...(created as Awaited<ReturnType<PromptLibrary["savePrompt"]>>), title: "Edited", tags: ["vscode"] };
    const saved = await handleManagerRequest(
      { id: "2", type: "PROMPT_SAVE", prompt, content: "Hello {{name}}", minorEdit: true },
      bridge
    );
    expect((saved as { title: string }).title).toBe("Edited");

    const duplicate = await handleManagerRequest({ id: "3", type: "PROMPT_DUPLICATE", token: "/new-prompt" }, bridge);
    expect((duplicate as { command: string }).command).toBe("/copy-of-new-prompt");

    await handleManagerRequest({ id: "4", type: "PROMPT_DELETE", token: "/copy-of-new-prompt" }, bridge);
    const state = await handleManagerRequest({ id: "5", type: "LIBRARY_GET" }, bridge);
    expect((state as { prompts: unknown[] }).prompts).toHaveLength(1);
    expect(refreshCount).toBe(4);
  });

  it("rejects command collisions when saving", async () => {
    const libraryPath = path.join(tmpDir, "library.json");
    const bridge = deps(libraryPath);
    const first = (await handleManagerRequest({ id: "1", type: "PROMPT_CREATE" }, bridge)) as Awaited<
      ReturnType<PromptLibrary["savePrompt"]>
    >;
    const second = (await handleManagerRequest({ id: "2", type: "PROMPT_CREATE" }, bridge)) as Awaited<
      ReturnType<PromptLibrary["savePrompt"]>
    >;

    await expect(
      handleManagerRequest({ id: "3", type: "PROMPT_SAVE", prompt: { ...second, aliases: [first.command] } }, bridge)
    ).rejects.toThrow(/Command collision/);
  });

  it("routes insert and copy requests through injected VS Code actions", async () => {
    const libraryPath = path.join(tmpDir, "library.json");
    const bridge = deps(libraryPath);
    await handleManagerRequest({ id: "1", type: "PROMPT_INSERT", token: "/paper" }, bridge);
    await handleManagerRequest({ id: "2", type: "PROMPT_COPY", token: "/paper" }, bridge);

    expect(inserted).toEqual(["/paper"]);
    expect(copied).toEqual(["/paper"]);
  });

  it("exports and imports backups", async () => {
    const sourcePath = path.join(tmpDir, "source.json");
    const targetPath = path.join(tmpDir, "target.json");
    const source = deps(sourcePath);
    const target = deps(targetPath);

    await handleManagerRequest({ id: "1", type: "PROMPT_CREATE" }, source);
    const backup = (await handleManagerRequest({ id: "2", type: "BACKUP_EXPORT" }, source)) as {
      filename: string;
      content: string;
    };
    expect(backup.filename).toMatch(/^promptdeck-backup-/);

    await handleManagerRequest({ id: "3", type: "BACKUP_IMPORT", raw: JSON.parse(backup.content), mode: "merge-safe" }, target);
    const state = await handleManagerRequest({ id: "4", type: "LIBRARY_GET" }, target);
    expect((state as { prompts: unknown[] }).prompts).toHaveLength(1);
  });
});
