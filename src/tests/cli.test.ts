import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { PromptLibrary } from "../core/library";
import { createBackup } from "../shared/backup";
import { EXIT_CLIPBOARD, EXIT_NOT_FOUND, EXIT_OK, run, type CliIO } from "../cli/run";
import type { ClipboardResult } from "../core/clipboard";

let tmpDir: string;
let libPath: string;

interface Harness {
  io: CliIO;
  out: string[];
  err: string[];
  clipboard: { text?: string };
}

function makeHarness(overrides: Partial<CliIO> = {}): Harness {
  const out: string[] = [];
  const err: string[] = [];
  const clipboard: { text?: string } = {};
  const io: CliIO = {
    stdout: (text) => out.push(text),
    stderr: (text) => err.push(text),
    copy: (text): ClipboardResult => {
      clipboard.text = text;
      return { ok: true };
    },
    clipboardAvailable: () => true,
    createLibrary: (p) => new PromptLibrary({ path: p || libPath }),
    readFile: (filePath) => fs.readFileSync(filePath, "utf8"),
    writeFile: (filePath, data) => fs.writeFileSync(filePath, data, "utf8"),
    readStdin: () => "",
    stdinIsTTY: () => false,
    confirm: () => true,
    editInEditor: async (initial) => initial,
    platform: "linux",
    ...overrides
  };
  return { io, out, err, clipboard };
}

async function addNote(): Promise<void> {
  await run(["add", "/note", "--content", "v1 body"], makeHarness().io);
}

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "promptdeck-cli-"));
  libPath = path.join(tmpDir, "library.json");
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe("cli run", () => {
  it("prints version", async () => {
    const h = makeHarness();
    const code = await run(["--version"], h.io);
    expect(code).toBe(EXIT_OK);
    expect(h.out.join("\n")).toContain("0.1.0");
  });

  it("lists seeded prompts", async () => {
    const h = makeHarness();
    const code = await run(["list"], h.io);
    expect(code).toBe(EXIT_OK);
    expect(h.out.join("\n")).toContain("/paper-reading");
  });

  it("outputs JSON for list --json", async () => {
    const h = makeHarness();
    await run(["list", "--json"], h.io);
    const parsed = JSON.parse(h.out.join("\n"));
    expect(Array.isArray(parsed)).toBe(true);
    expect(parsed[0]).toHaveProperty("command");
  });

  it("searches and returns JSON with scores", async () => {
    const h = makeHarness();
    await run(["search", "paper", "--json"], h.io);
    const parsed = JSON.parse(h.out.join("\n"));
    expect(parsed[0]).toHaveProperty("score");
    expect(parsed[0].command).toBe("/paper-reading");
  });

  it("prints resolved variant content to stdout", async () => {
    const h = makeHarness();
    const code = await run(["print", "paper:short"], h.io);
    expect(code).toBe(EXIT_OK);
    expect(h.out.join("\n")).toContain("8 bullets");
  });

  it("copies to the clipboard and records usage", async () => {
    const h = makeHarness();
    const code = await run(["copy", "/paper-reading"], h.io);
    expect(code).toBe(EXIT_OK);
    expect(h.clipboard.text).toContain("structured research brief");
    const usage = new PromptLibrary({ path: libPath }).list().find((p) => p.id === "paper-reading")?.usageCount;
    expect(usage).toBe(1);
  });

  it("leaves placeholders raw when no variables are provided", async () => {
    const h = makeHarness();
    await run(["print", "paper:short"], h.io);
    expect(h.out.join("\n")).toContain("{{paper_text}}");
  });

  it("compiles placeholders from --var", async () => {
    const h = makeHarness();
    const code = await run(["print", "paper:short", "--var", "paper_text=HELLO WORLD"], h.io);
    expect(code).toBe(EXIT_OK);
    const out = h.out.join("\n");
    expect(out).toContain("HELLO WORLD");
    expect(out).not.toContain("{{paper_text}}");
  });

  it("compiles placeholders from a --vars JSON file", async () => {
    const varsPath = path.join(tmpDir, "vars.json");
    fs.writeFileSync(varsPath, JSON.stringify({ paper_text: "FROM FILE" }));
    const h = makeHarness();
    await run(["copy", "paper:short", "--vars", varsPath], h.io);
    expect(h.clipboard.text).toContain("FROM FILE");
    expect(h.clipboard.text).not.toContain("{{paper_text}}");
  });

  it("warns but succeeds when a required variable is left unfilled", async () => {
    const h = makeHarness();
    const code = await run(["print", "paper:short", "--var", "unused=1"], h.io);
    expect(code).toBe(EXIT_OK);
    expect(h.err.join("\n")).toContain("unfilled variables");
    expect(h.err.join("\n")).toContain("paper_text");
  });

  it("fails under --strict when a required variable is missing", async () => {
    const h = makeHarness();
    const code = await run(["print", "paper:short", "--var", "unused=1", "--strict"], h.io);
    expect(code).toBe(1);
    expect(h.err.join("\n")).toContain("Missing required variables");
  });

  it("rejects a malformed --var", async () => {
    const h = makeHarness();
    const code = await run(["print", "paper:short", "--var", "noequals"], h.io);
    expect(code).toBe(1);
    expect(h.err.join("\n")).toContain("Use --var name=value");
  });

  it("returns not-found exit code for unknown tokens", async () => {
    const h = makeHarness();
    const code = await run(["print", "does-not-exist"], h.io);
    expect(code).toBe(EXIT_NOT_FOUND);
  });

  it("returns clipboard exit code when clipboard is unavailable", async () => {
    const h = makeHarness({ clipboardAvailable: () => false });
    const code = await run(["copy", "/paper-reading"], h.io);
    expect(code).toBe(EXIT_CLIPBOARD);
  });

  it("imports a backup and reports counts", async () => {
    const backupPath = path.join(tmpDir, "backup.json");
    const now = "2026-01-01T00:00:00.000Z";
    fs.writeFileSync(
      backupPath,
      JSON.stringify(
        createBackup([
          {
            id: "commit-message",
            title: "Commit Message",
            command: "/commit-message",
            aliases: [],
            tags: ["git"],
            description: "",
            defaultVersionId: "v1",
            versions: [{ id: "v1", promptId: "commit-message", label: "Original", content: "commit body", changelog: "", createdAt: now, createdBy: "local user", isDefault: true }],
            variants: [],
            variables: {},
            createdAt: now,
            updatedAt: now,
            usageCount: 0
          }
        ])
      )
    );
    const h = makeHarness();
    const code = await run(["import", backupPath, "--mode", "merge-safe"], h.io);
    expect(code).toBe(EXIT_OK);
    expect(h.err.join("\n")).toContain("1 added");
    expect(new PromptLibrary({ path: libPath }).resolve("/commit-message")).toBeTruthy();
  });

  it("exports a backup to stdout", async () => {
    const h = makeHarness();
    await run(["export", "-"], h.io);
    const parsed = JSON.parse(h.out.join("\n"));
    expect(parsed.kind).toBe("promptdeck.backup");
    expect(parsed.data.prompts.length).toBeGreaterThan(0);
  });

  it("adds a prompt from --content and resolves it", async () => {
    const h = makeHarness();
    const code = await run(
      ["add", "/standup", "--content", "Write a standup update for {{day}}.", "--tags", "team,daily", "--alias", "su"],
      h.io
    );
    expect(code).toBe(EXIT_OK);
    const lib = new PromptLibrary({ path: libPath });
    expect(lib.resolve("/standup")?.resolved.content).toContain("standup update");
    expect(lib.resolve("su")?.prompt.id).toBe("standup"); // alias resolves
  });

  it("adds a prompt from --edit using the editor result", async () => {
    const h = makeHarness({
      editInEditor: async () => `---
command: /edited
title: Edited Prompt
aliases: [/ed]
tags: [authoring, cli]
description: Created in an editor
---
Edited body`
    });
    const code = await run(["add", "/edited", "--edit"], h.io);
    expect(code).toBe(EXIT_OK);
    const prompt = new PromptLibrary({ path: libPath }).resolve("/edited")!;
    expect(prompt.prompt.title).toBe("Edited Prompt");
    expect(prompt.prompt.aliases).toEqual(["/ed"]);
    expect(prompt.resolved.content).toBe("Edited body");
  });

  it("aborts add --edit when the editor content is unchanged", async () => {
    const h = makeHarness({ editInEditor: async (initial) => initial });
    const code = await run(["add", "/unchanged", "--edit"], h.io);
    expect(code).toBe(EXIT_OK);
    expect(h.err.join("\n")).toContain("Aborted");
    expect(new PromptLibrary({ path: libPath }).resolve("/unchanged")).toBeUndefined();
  });

  it("rejects --edit combined with --content", async () => {
    const h = makeHarness();
    const code = await run(["add", "/bad", "--edit", "--content", "body"], h.io);
    expect(code).toBe(1);
    expect(h.err.join("\n")).toContain("cannot be combined");
  });

  it("rejects add when the command collides", async () => {
    const h = makeHarness();
    await run(["add", "/dup", "--content", "one"], h.io);
    const h2 = makeHarness();
    const code = await run(["add", "/dup", "--content", "two"], h2.io);
    expect(code).toBe(1);
    expect(h2.err.join("\n")).toMatch(/already exists/);
  });

  it("reads add content from stdin via --file -", async () => {
    const h = makeHarness({ readStdin: () => "from stdin body" });
    await run(["add", "/piped", "--file", "-"], h.io);
    expect(new PromptLibrary({ path: libPath }).resolve("/piped")?.resolved.content).toBe("from stdin body");
  });

  it("edits a prompt and creates a new version by default", async () => {
    const h = makeHarness();
    await run(["add", "/note", "--content", "v1 body"], h.io);
    const before = new PromptLibrary({ path: libPath }).resolve("/note")!.prompt.versions.length;
    await run(["edit", "/note", "--content", "v2 body"], makeHarness().io);
    const after = new PromptLibrary({ path: libPath }).resolve("/note")!;
    expect(after.resolved.content).toBe("v2 body");
    expect(after.prompt.versions.length).toBe(before + 1);
  });

  it("edits a prompt in place with --minor", async () => {
    await addNote();
    await run(["edit", "/note", "--content", "patched", "--minor"], makeHarness().io);
    const after = new PromptLibrary({ path: libPath }).resolve("/note")!;
    expect(after.resolved.content).toBe("patched");
    expect(after.prompt.versions.length).toBe(1);
  });

  it("edits a prompt document in place by default with --edit", async () => {
    await addNote();
    const h = makeHarness({
      editInEditor: async (initial) => initial.replace("v1 body", "edited in place")
    });
    const code = await run(["edit", "/note", "--edit"], h.io);
    expect(code).toBe(EXIT_OK);
    const after = new PromptLibrary({ path: libPath }).resolve("/note")!;
    expect(after.resolved.content).toBe("edited in place");
    expect(after.prompt.versions.length).toBe(1);
  });

  it("creates a new version for edit --edit --new-version", async () => {
    await addNote();
    const h = makeHarness({
      editInEditor: async (initial) => initial.replace("v1 body", "edited as new version")
    });
    const code = await run(["edit", "/note", "--edit", "--new-version"], h.io);
    expect(code).toBe(EXIT_OK);
    const after = new PromptLibrary({ path: libPath }).resolve("/note")!;
    expect(after.resolved.content).toBe("edited as new version");
    expect(after.prompt.versions.length).toBe(2);
  });

  it("removes a prompt without confirmation when stdin is not a TTY", async () => {
    await addNote();
    let asked = false;
    const code = await run(["rm", "/note"], makeHarness({ confirm: () => {
      asked = true;
      return false;
    } }).io);
    expect(code).toBe(EXIT_OK);
    expect(asked).toBe(false);
    expect(new PromptLibrary({ path: libPath }).list().some((p) => p.id === "note")).toBe(false);
  });

  it("aborts rm when confirmation is declined", async () => {
    await addNote();
    const h = makeHarness({ stdinIsTTY: () => true, confirm: () => false });
    const code = await run(["rm", "/note"], h.io);
    expect(code).toBe(EXIT_OK);
    expect(h.err.join("\n")).toContain("Aborted");
    expect(new PromptLibrary({ path: libPath }).resolve("/note")).toBeTruthy();
  });

  it("removes a prompt with --yes without asking for confirmation", async () => {
    await addNote();
    let asked = false;
    const h = makeHarness({
      stdinIsTTY: () => true,
      confirm: () => {
        asked = true;
        return false;
      }
    });
    const code = await run(["rm", "/note", "--yes"], h.io);
    expect(code).toBe(EXIT_OK);
    expect(asked).toBe(false);
    expect(new PromptLibrary({ path: libPath }).list().some((p) => p.id === "note")).toBe(false);
  });

  it("returns not-found when removing a missing prompt", async () => {
    const code = await run(["rm", "/nope-nope"], makeHarness().io);
    expect(code).toBe(EXIT_NOT_FOUND);
  });

  it("previews an import with --dry-run without writing", async () => {
    const backupPath = path.join(tmpDir, "dry.json");
    const now = "2026-01-01T00:00:00.000Z";
    fs.writeFileSync(
      backupPath,
      JSON.stringify(
        createBackup([
          {
            id: "fresh",
            title: "Fresh",
            command: "/fresh",
            aliases: [],
            tags: [],
            description: "",
            defaultVersionId: "v1",
            versions: [{ id: "v1", promptId: "fresh", label: "Original", content: "x", changelog: "", createdAt: now, createdBy: "local user", isDefault: true }],
            variants: [],
            variables: {},
            createdAt: now,
            updatedAt: now,
            usageCount: 0
          }
        ])
      )
    );
    const h = makeHarness();
    const code = await run(["import", backupPath, "--dry-run", "--json"], h.io);
    expect(code).toBe(EXIT_OK);
    const summary = JSON.parse(h.out.join("\n"));
    expect(summary.newPromptCount).toBe(1);
    // Nothing was written: the new prompt must not be in the library.
    expect(new PromptLibrary({ path: libPath }).list().some((p) => p.id === "fresh")).toBe(false);
  });

  it("reports doctor JSON with clipboard status", async () => {
    const h = makeHarness();
    await run(["doctor", "--json"], h.io);
    const parsed = JSON.parse(h.out.join("\n"));
    expect(parsed.libraryPath).toBe(libPath);
    expect(parsed).toHaveProperty("clipboardAvailable", true);
  });
});
