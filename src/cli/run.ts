import fs from "node:fs";
import type { Prompt } from "../shared/models/prompt";
import type { ImportMode } from "../shared/backup";
import { PromptLibrary } from "../core/library";
import { clipboardAvailable as defaultClipboardAvailable, copyToClipboard, type ClipboardResult } from "../core/clipboard";
import { flagBool, flagString, parseArgs } from "./args";

export const VERSION = "0.1.0";

export const EXIT_OK = 0;
export const EXIT_ERROR = 1;
export const EXIT_NOT_FOUND = 2;
export const EXIT_CLIPBOARD = 3;

export interface CliIO {
  stdout(text: string): void;
  stderr(text: string): void;
  copy(text: string): ClipboardResult;
  clipboardAvailable(): boolean;
  createLibrary(libraryPath?: string): PromptLibrary;
  readFile(filePath: string): string;
  writeFile(filePath: string, data: string): void;
  /** Optional terminal picker; returns the selected token, or undefined if cancelled. */
  interactivePick?(library: PromptLibrary): Promise<string | undefined>;
  platform: NodeJS.Platform;
}

const HELP = `PromptDeck — local-first prompt library

Usage:
  promptdeck <command> [options]

Commands:
  list                          List all prompts.
  search <query>                Search prompts by command, alias, title, tags, description.
  show <token>                  Show a prompt and its resolved content.
  copy <token>                  Copy resolved prompt content to the clipboard.
  print <token>                 Print resolved prompt content to stdout (pipe-friendly).
  import <backup.json>          Import a PromptDeck backup into the local library.
  export [output.json]          Export the local library as a PromptDeck backup ("-" for stdout).
  pick                          Interactively search and copy a prompt.
  doctor                        Report storage path, prompt count, schema, clipboard status.

Tokens:
  A token is "command[:suffix]" where suffix selects a variant or version,
  e.g. "paper", "/paper-reading:short", "commit-message:v2".

Options:
  --json                        Machine-readable JSON output (list, search, show, doctor).
  --limit <n>                   Limit search results.
  --mode <merge-safe|merge-update|replace>   Import strategy (default: merge-safe).
  --library <path>              Use a specific library file.
  -h, --help                    Show help.
  --version                     Show version.

Storage:
  Default library: ~/.promptdeck/library.json
  Override with PROMPTDECK_LIBRARY (file) or PROMPTDECK_HOME (directory).
`;

function promptSummary(prompt: Prompt): Record<string, unknown> {
  return {
    id: prompt.id,
    title: prompt.title,
    command: prompt.command,
    aliases: prompt.aliases,
    tags: prompt.tags,
    description: prompt.description,
    defaultVersionId: prompt.defaultVersionId,
    versions: prompt.versions.map((version) => ({ id: version.id, label: version.label })),
    variants: prompt.variants.map((variant) => ({ name: variant.name, suffix: variant.suffix })),
    usageCount: prompt.usageCount || 0
  };
}

function suffixHint(prompt: Prompt): string {
  const hints = [
    ...prompt.variants.map((variant) => variant.suffix),
    ...prompt.versions.filter((version) => version.id !== prompt.defaultVersionId).map((version) => version.id)
  ];
  return hints.length ? ` (${hints.join(", ")})` : "";
}

function libraryFrom(io: CliIO, flags: Record<string, string | boolean>): PromptLibrary {
  return io.createLibrary(flagString(flags, "library"));
}

function cmdList(io: CliIO, flags: Record<string, string | boolean>): number {
  const prompts = libraryFrom(io, flags).list();
  if (flagBool(flags, "json")) {
    io.stdout(JSON.stringify(prompts.map(promptSummary), null, 2));
    return EXIT_OK;
  }
  if (prompts.length === 0) {
    io.stderr("No prompts in the local library yet.");
    return EXIT_OK;
  }
  for (const prompt of prompts) {
    io.stdout(`${prompt.command}${suffixHint(prompt)}  —  ${prompt.title}`);
  }
  return EXIT_OK;
}

function cmdSearch(io: CliIO, positionals: string[], flags: Record<string, string | boolean>): number {
  const query = positionals.join(" ");
  if (!query) {
    io.stderr("Usage: promptdeck search <query>");
    return EXIT_ERROR;
  }
  let results = libraryFrom(io, flags).search(query);
  const limit = Number(flagString(flags, "limit"));
  if (Number.isFinite(limit) && limit > 0) results = results.slice(0, limit);

  if (flagBool(flags, "json")) {
    io.stdout(
      JSON.stringify(
        results.map((result) => ({ score: result.score, reason: result.reason, ...promptSummary(result.prompt) })),
        null,
        2
      )
    );
    return EXIT_OK;
  }
  if (results.length === 0) {
    io.stderr(`No prompts matched "${query}".`);
    return EXIT_NOT_FOUND;
  }
  for (const result of results) {
    io.stdout(`${result.prompt.command}${suffixHint(result.prompt)}  —  ${result.prompt.title}`);
  }
  return EXIT_OK;
}

function cmdShow(io: CliIO, positionals: string[], flags: Record<string, string | boolean>): number {
  const token = positionals[0];
  if (!token) {
    io.stderr("Usage: promptdeck show <command-or-id>[:variant-or-version]");
    return EXIT_ERROR;
  }
  const resolution = libraryFrom(io, flags).resolve(token);
  if (!resolution) {
    io.stderr(`No prompt found for "${token}".`);
    return EXIT_NOT_FOUND;
  }
  const { prompt, resolved } = resolution;
  if (flagBool(flags, "json")) {
    io.stdout(
      JSON.stringify(
        {
          ...promptSummary(prompt),
          resolved: { kind: resolved.kind, suffix: resolved.suffix, content: resolved.content }
        },
        null,
        2
      )
    );
    return EXIT_OK;
  }
  io.stdout(`# ${prompt.title}`);
  io.stdout(`Command: ${prompt.command}`);
  if (prompt.aliases.length) io.stdout(`Aliases: ${prompt.aliases.join(", ")}`);
  if (prompt.tags.length) io.stdout(`Tags: ${prompt.tags.join(", ")}`);
  if (prompt.description) io.stdout(`Description: ${prompt.description}`);
  if (prompt.variants.length) io.stdout(`Variants: ${prompt.variants.map((v) => v.suffix).join(", ")}`);
  io.stdout(`Resolved: ${resolved.kind}${resolved.suffix ? ` (${resolved.suffix})` : ""}`);
  io.stdout("");
  io.stdout(resolved.content);
  return EXIT_OK;
}

function cmdPrint(io: CliIO, positionals: string[], flags: Record<string, string | boolean>): number {
  const token = positionals[0];
  if (!token) {
    io.stderr("Usage: promptdeck print <command-or-id>[:variant-or-version]");
    return EXIT_ERROR;
  }
  const resolution = libraryFrom(io, flags).resolve(token);
  if (!resolution) {
    io.stderr(`No prompt found for "${token}".`);
    return EXIT_NOT_FOUND;
  }
  io.stdout(resolution.resolved.content);
  return EXIT_OK;
}

function copyResolved(io: CliIO, library: PromptLibrary, token: string): number {
  const resolution = library.resolve(token);
  if (!resolution) {
    io.stderr(`No prompt found for "${token}".`);
    return EXIT_NOT_FOUND;
  }
  if (!io.clipboardAvailable()) {
    io.stderr("Clipboard is not available. Use `promptdeck print` to write to stdout instead.");
    return EXIT_CLIPBOARD;
  }
  const result = io.copy(resolution.resolved.content);
  if (!result.ok) {
    io.stderr(result.reason || "Failed to copy to clipboard.");
    return EXIT_CLIPBOARD;
  }
  library.recordUsage(resolution.prompt.id);
  const label = resolution.resolved.suffix ? `${resolution.prompt.command}:${resolution.resolved.suffix}` : resolution.prompt.command;
  io.stderr(`Copied ${label} to the clipboard.`);
  return EXIT_OK;
}

function cmdCopy(io: CliIO, positionals: string[], flags: Record<string, string | boolean>): number {
  const token = positionals[0];
  if (!token) {
    io.stderr("Usage: promptdeck copy <command-or-id>[:variant-or-version]");
    return EXIT_ERROR;
  }
  return copyResolved(io, libraryFrom(io, flags), token);
}

function cmdImport(io: CliIO, positionals: string[], flags: Record<string, string | boolean>): number {
  const file = positionals[0];
  if (!file) {
    io.stderr("Usage: promptdeck import <backup.json> [--mode merge-safe|merge-update|replace]");
    return EXIT_ERROR;
  }
  const mode = (flagString(flags, "mode") || "merge-safe") as ImportMode;
  if (!["merge-safe", "merge-update", "replace"].includes(mode)) {
    io.stderr(`Unknown import mode "${mode}". Use merge-safe, merge-update, or replace.`);
    return EXIT_ERROR;
  }
  let raw: unknown;
  try {
    raw = JSON.parse(io.readFile(file));
  } catch (error) {
    io.stderr(error instanceof Error ? error.message : `Could not read ${file}.`);
    return EXIT_ERROR;
  }
  try {
    const result = libraryFrom(io, flags).importBackup(raw, mode);
    io.stderr(
      `Imported (${mode}): ${result.importedPromptCount} added, ${result.mergedPromptCount} merged, ` +
        `${result.replacedPromptCount} replaced, ${result.skippedConflictCount} skipped.`
    );
    result.warnings.forEach((warning) => io.stderr(`Warning: ${warning}`));
    return EXIT_OK;
  } catch (error) {
    io.stderr(error instanceof Error ? error.message : "Import failed.");
    return EXIT_ERROR;
  }
}

function cmdExport(io: CliIO, positionals: string[], flags: Record<string, string | boolean>): number {
  const target = positionals[0];
  const data = libraryFrom(io, flags).exportBackupString();
  if (!target || target === "-") {
    io.stdout(data);
    return EXIT_OK;
  }
  try {
    io.writeFile(target, `${data}\n`);
    io.stderr(`Exported backup to ${target}.`);
    return EXIT_OK;
  } catch (error) {
    io.stderr(error instanceof Error ? error.message : `Could not write ${target}.`);
    return EXIT_ERROR;
  }
}

function cmdDoctor(io: CliIO, flags: Record<string, string | boolean>): number {
  const report = libraryFrom(io, flags).doctor();
  const clipboard = io.clipboardAvailable();
  if (flagBool(flags, "json")) {
    io.stdout(JSON.stringify({ ...report, clipboardAvailable: clipboard }, null, 2));
    return EXIT_OK;
  }
  io.stdout(`Library path:   ${report.libraryPath}`);
  io.stdout(`Library exists: ${report.libraryExists ? "yes" : "no (created on first use)"}`);
  io.stdout(`Prompts:        ${report.promptCount}`);
  io.stdout(`Versions:       ${report.versionCount}`);
  io.stdout(`Variants:       ${report.variantCount}`);
  io.stdout(`Schema version: ${report.schemaVersion}`);
  io.stdout(`Trigger:        ${report.settingsTrigger}`);
  io.stdout(`Clipboard:      ${clipboard ? "available" : "not available"}`);
  return EXIT_OK;
}

async function cmdPick(io: CliIO, flags: Record<string, string | boolean>): Promise<number> {
  if (!io.interactivePick) {
    io.stderr("Interactive pick is only available in a terminal. Use `promptdeck search` then `copy`.");
    return EXIT_ERROR;
  }
  const library = libraryFrom(io, flags);
  const token = await io.interactivePick(library);
  if (!token) {
    io.stderr("Cancelled.");
    return EXIT_OK;
  }
  return copyResolved(io, library, token);
}

export async function run(argv: string[], io: CliIO): Promise<number> {
  const { positionals, flags } = parseArgs(argv, ["json", "help", "version", "yes"]);
  const command = positionals.shift();

  if (flagBool(flags, "version")) {
    io.stdout(VERSION);
    return EXIT_OK;
  }
  if (!command || flagBool(flags, "help") || command === "help") {
    io.stdout(HELP);
    return EXIT_OK;
  }

  switch (command) {
    case "list":
      return cmdList(io, flags);
    case "search":
      return cmdSearch(io, positionals, flags);
    case "show":
      return cmdShow(io, positionals, flags);
    case "copy":
      return cmdCopy(io, positionals, flags);
    case "print":
      return cmdPrint(io, positionals, flags);
    case "import":
      return cmdImport(io, positionals, flags);
    case "export":
      return cmdExport(io, positionals, flags);
    case "doctor":
      return cmdDoctor(io, flags);
    case "pick":
      return cmdPick(io, flags);
    default:
      io.stderr(`Unknown command "${command}". Run "promptdeck --help".`);
      return EXIT_ERROR;
  }
}

/** Default IO wired to the real filesystem and clipboard. */
export function createDefaultIO(overrides: Partial<CliIO> = {}): CliIO {
  return {
    stdout: (text) => process.stdout.write(`${text}\n`),
    stderr: (text) => process.stderr.write(`${text}\n`),
    copy: (text) => copyToClipboard(text),
    clipboardAvailable: () => defaultClipboardAvailable(),
    createLibrary: (libraryPath) => new PromptLibrary(libraryPath ? { path: libraryPath } : {}),
    readFile: (filePath) => fs.readFileSync(filePath, "utf8"),
    writeFile: (filePath, data) => fs.writeFileSync(filePath, data, "utf8"),
    platform: process.platform,
    ...overrides
  };
}
