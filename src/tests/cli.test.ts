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
    platform: "linux",
    ...overrides
  };
  return { io, out, err, clipboard };
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

  it("reports doctor JSON with clipboard status", async () => {
    const h = makeHarness();
    await run(["doctor", "--json"], h.io);
    const parsed = JSON.parse(h.out.join("\n"));
    expect(parsed.libraryPath).toBe(libPath);
    expect(parsed).toHaveProperty("clipboardAvailable", true);
  });
});
