import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { FileStore, LIBRARY_KIND, createLibraryFile, normalizePrompt } from "../core/fileStore";
import { resolveDataDir, resolveLibraryPath } from "../core/paths";
import type { Prompt } from "../shared/models/prompt";

let tmpDir: string;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "promptdeck-store-"));
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe("path resolution", () => {
  it("prefers PROMPTDECK_LIBRARY over everything", () => {
    expect(resolveLibraryPath({ PROMPTDECK_LIBRARY: "/a/b.json" }, "linux")).toBe("/a/b.json");
  });

  it("uses PROMPTDECK_HOME directory", () => {
    expect(resolveLibraryPath({ PROMPTDECK_HOME: "/home/x/pd" }, "linux")).toBe("/home/x/pd/library.json");
  });

  it("uses XDG_DATA_HOME when set", () => {
    expect(resolveDataDir({ XDG_DATA_HOME: "/data" }, "linux")).toBe("/data/promptdeck");
  });

  it("uses APPDATA on Windows", () => {
    expect(resolveDataDir({ APPDATA: "C:\\Users\\x\\AppData\\Roaming" }, "win32")).toContain("PromptDeck");
  });
});

describe("FileStore", () => {
  it("seeds a new library on first load", () => {
    const store = new FileStore({ path: path.join(tmpDir, "library.json") });
    expect(store.exists()).toBe(false);
    const library = store.load();
    expect(library.kind).toBe(LIBRARY_KIND);
    expect(library.prompts.length).toBeGreaterThan(0);
    expect(store.exists()).toBe(true);
  });

  it("does not seed when seeding is disabled", () => {
    const store = new FileStore({ path: path.join(tmpDir, "library.json"), seed: false });
    expect(store.load().prompts).toHaveLength(0);
  });

  it("round-trips writes", () => {
    const store = new FileStore({ path: path.join(tmpDir, "library.json"), seed: false });
    const library = createLibraryFile([]);
    store.write(library);
    const reloaded = store.load();
    expect(reloaded.kind).toBe(LIBRARY_KIND);
  });

  it("throws on invalid JSON", () => {
    const file = path.join(tmpDir, "library.json");
    fs.writeFileSync(file, "{not json", "utf8");
    const store = new FileStore({ path: file });
    expect(() => store.load()).toThrow(/not valid JSON/);
  });
});

describe("normalizePrompt", () => {
  it("adds a leading slash to command and aliases and fills body/variables", () => {
    const prompt = {
      id: "p",
      title: "P",
      command: "p",
      aliases: ["alt"],
      tags: [],
      description: "",
      defaultVersionId: "v1",
      versions: [
        { id: "v1", promptId: "p", label: "L", content: "Hello {{name}}", changelog: "", createdAt: "", createdBy: "local user", isDefault: true }
      ],
      variants: [],
      variables: {},
      createdAt: "",
      updatedAt: "",
      usageCount: 0
    } as unknown as Prompt;
    const normalized = normalizePrompt(prompt);
    expect(normalized.command).toBe("/p");
    expect(normalized.aliases).toEqual(["/alt"]);
    expect(normalized.body).toBe("Hello {{name}}");
    expect(Object.keys(normalized.variables)).toContain("name");
  });
});
