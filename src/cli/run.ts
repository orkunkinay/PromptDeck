import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import { createInterface } from "node:readline/promises";
import type { Prompt } from "../shared/models/prompt";
import type { ImportMode } from "../shared/backup";
import { PromptLibrary } from "../core/library";
import { clipboardAvailable as defaultClipboardAvailable, copyToClipboard, type ClipboardResult } from "../core/clipboard";
import { parsePromptDocument, promptTemplate, serializePromptDocument } from "../core/promptDocument";
import { compilePrompt } from "../shared/promptCompiler/compiler";
import type { TokenResolution } from "../core/resolve";
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
  /** Read all of stdin (used for `--file -`). */
  readStdin(): string;
  /** Whether stdin is attached to an interactive terminal. */
  stdinIsTTY(): boolean;
  /** Ask a yes/no terminal question. */
  confirm(question: string): boolean | Promise<boolean>;
  /** Open the user's editor with initial content; undefined means editor failed/cancelled. */
  editInEditor(initial: string, ext?: string): Promise<string | undefined>;
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
  add <command>                 Create a new prompt (content via --content/--file/stdin).
  edit <token>                  Update a prompt's metadata and/or content.
  rm <command-or-id>            Delete a prompt.
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
  --var name=value              Fill a {{placeholder}} (repeatable; copy/print).
  --vars <file.json>            Fill placeholders from a JSON object of name/value pairs.
  --strict                      Fail if required placeholders are left unfilled (copy/print).
  --content <text>              Prompt body for add/edit.
  --file <path>                 Read the prompt body from a file ("-" for stdin) for add/edit.
  -e, --edit                    Open $EDITOR on a prompt document for add/edit.
  --title <text>                Prompt title for add/edit.
  --tags a,b,c                  Comma-separated tags for add/edit.
  --alias <name>                Alias for add/edit (repeatable).
  --desc <text>                 Description for add/edit.
  --minor                       Edit the default version in place instead of versioning.
  --new-version                 With edit --edit, save as a new version instead of in place.
  --yes                         Skip delete confirmation.
  --dry-run                     Preview an import without writing.
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

interface VariableValues {
  values: Record<string, string>;
  /** True when the user supplied any --var/--vars, so we should compile. */
  provided: boolean;
  error?: string;
}

/** Gather placeholder values from `--vars <file>` and repeated `--var name=value`. */
function collectValues(io: CliIO, flags: Record<string, string | boolean>, lists: Record<string, string[]>): VariableValues {
  const values: Record<string, string> = {};
  let provided = false;

  const varsFile = flagString(flags, "vars");
  if (varsFile) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(io.readFile(varsFile));
    } catch (error) {
      return { values, provided, error: error instanceof Error ? error.message : `Could not read ${varsFile}.` };
    }
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return { values, provided, error: `${varsFile} must contain a JSON object of name/value pairs.` };
    }
    for (const [key, value] of Object.entries(parsed as Record<string, unknown>)) {
      values[key] = String(value);
    }
    provided = true;
  }

  for (const entry of lists.var || []) {
    const eq = entry.indexOf("=");
    if (eq === -1) {
      return { values, provided, error: `Invalid --var "${entry}". Use --var name=value.` };
    }
    values[entry.slice(0, eq)] = entry.slice(eq + 1);
    provided = true;
  }

  return { values, provided };
}

interface CompiledContent {
  content: string;
  missingRequired: string[];
}

/** Compile placeholders when values were provided; otherwise pass content through unchanged. */
function compileResolved(resolution: TokenResolution, vars: VariableValues): CompiledContent {
  if (!vars.provided) return { content: resolution.resolved.content, missingRequired: [] };
  const result = compilePrompt({
    content: resolution.resolved.content,
    values: vars.values,
    definitions: resolution.prompt.variables
  });
  return { content: result.compiled, missingRequired: result.missingRequired };
}

function splitList(value: string | undefined): string[] | undefined {
  if (value === undefined) return undefined;
  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

interface ContentArg {
  content?: string;
  error?: string;
}

/** Resolve prompt body from --content, --file <path>, or --file - (stdin). */
function readContentArg(io: CliIO, flags: Record<string, string | boolean>): ContentArg {
  const inline = flagString(flags, "content");
  const file = flagString(flags, "file");
  if (inline !== undefined && file !== undefined) {
    return { error: "Use either --content or --file, not both." };
  }
  if (inline !== undefined) return { content: inline };
  if (file !== undefined) {
    try {
      return { content: file === "-" ? io.readStdin() : io.readFile(file) };
    } catch (error) {
      return { error: error instanceof Error ? error.message : `Could not read ${file}.` };
    }
  }
  return {};
}

function editConflict(flags: Record<string, string | boolean>): string | undefined {
  if (!flagBool(flags, "edit")) return undefined;
  if (flagString(flags, "content") !== undefined || flagString(flags, "file") !== undefined) {
    return "Use --edit by itself; it cannot be combined with --content or --file.";
  }
  return undefined;
}

async function readEditedDocument(io: CliIO, initial: string): Promise<{ text?: string; error?: string; aborted?: boolean }> {
  const edited = await io.editInEditor(initial, ".prompt.md");
  if (edited === undefined) return { error: "Editor exited without saving a prompt document." };
  if (!edited.trim()) return { aborted: true };
  if (edited === initial) return { aborted: true };
  return { text: edited };
}

async function cmdAdd(
  io: CliIO,
  positionals: string[],
  flags: Record<string, string | boolean>,
  lists: Record<string, string[]>
): Promise<number> {
  const command = positionals[0];
  if (!command) {
    io.stderr("Usage: promptdeck add <command> [--content <text> | --file <path>] [--title] [--tags a,b] [--alias x] [--desc]");
    return EXIT_ERROR;
  }
  const conflict = editConflict(flags);
  if (conflict) {
    io.stderr(conflict);
    return EXIT_ERROR;
  }
  if (flagBool(flags, "edit")) {
    const edited = await readEditedDocument(io, promptTemplate(command));
    if (edited.error) {
      io.stderr(edited.error);
      return EXIT_ERROR;
    }
    if (edited.aborted || edited.text === undefined) {
      io.stderr("Aborted: prompt document was unchanged or empty.");
      return EXIT_OK;
    }
    try {
      const prompt = libraryFrom(io, flags).addPrompt(parsePromptDocument(edited.text));
      io.stderr(`Added ${prompt.command} (${prompt.id}).`);
      return EXIT_OK;
    } catch (err) {
      io.stderr(err instanceof Error ? err.message : "Could not add the prompt.");
      return EXIT_ERROR;
    }
  }
  const { content, error } = readContentArg(io, flags);
  if (error) {
    io.stderr(error);
    return EXIT_ERROR;
  }
  try {
    const prompt = libraryFrom(io, flags).addPrompt({
      command,
      title: flagString(flags, "title"),
      tags: splitList(flagString(flags, "tags")),
      aliases: lists.alias,
      description: flagString(flags, "desc"),
      content
    });
    io.stderr(`Added ${prompt.command} (${prompt.id}).`);
    return EXIT_OK;
  } catch (err) {
    io.stderr(err instanceof Error ? err.message : "Could not add the prompt.");
    return EXIT_ERROR;
  }
}

async function cmdEdit(
  io: CliIO,
  positionals: string[],
  flags: Record<string, string | boolean>,
  lists: Record<string, string[]>
): Promise<number> {
  const token = positionals[0];
  if (!token) {
    io.stderr("Usage: promptdeck edit <command-or-id> [--content <text> | --file <path>] [--title] [--tags] [--alias] [--desc] [--minor]");
    return EXIT_ERROR;
  }
  const conflict = editConflict(flags);
  if (conflict) {
    io.stderr(conflict);
    return EXIT_ERROR;
  }
  if (flagBool(flags, "edit")) {
    try {
      const library = libraryFrom(io, flags);
      const resolution = library.resolve(token);
      if (!resolution) {
        io.stderr(`No prompt found for "${token}".`);
        return EXIT_NOT_FOUND;
      }
      const initial = serializePromptDocument(resolution.prompt);
      const edited = await readEditedDocument(io, initial);
      if (edited.error) {
        io.stderr(edited.error);
        return EXIT_ERROR;
      }
      if (edited.aborted || edited.text === undefined) {
        io.stderr("Aborted: prompt document was unchanged or empty.");
        return EXIT_OK;
      }
      const parsed = parsePromptDocument(edited.text);
      if (parsed.command !== resolution.prompt.command) {
        io.stderr("Changing a prompt command is not supported when editing. Create a new prompt instead.");
        return EXIT_ERROR;
      }
      const prompt = library.updatePrompt(token, {
        title: parsed.title,
        description: parsed.description,
        tags: parsed.tags,
        aliases: parsed.aliases,
        content: parsed.content,
        minor: !flagBool(flags, "new-version")
      });
      io.stderr(`Updated ${prompt.command} (${prompt.id}).`);
      return EXIT_OK;
    } catch (err) {
      const message = err instanceof Error ? err.message : "Could not edit the prompt.";
      io.stderr(message);
      return message.startsWith("No prompt found") ? EXIT_NOT_FOUND : EXIT_ERROR;
    }
  }
  const { content, error } = readContentArg(io, flags);
  if (error) {
    io.stderr(error);
    return EXIT_ERROR;
  }
  try {
    const prompt = libraryFrom(io, flags).updatePrompt(token, {
      title: flagString(flags, "title"),
      description: flagString(flags, "desc"),
      tags: splitList(flagString(flags, "tags")),
      aliases: lists.alias,
      content,
      minor: flagBool(flags, "minor")
    });
    io.stderr(`Updated ${prompt.command} (${prompt.id}).`);
    return EXIT_OK;
  } catch (err) {
    const message = err instanceof Error ? err.message : "Could not edit the prompt.";
    io.stderr(message);
    return message.startsWith("No prompt found") ? EXIT_NOT_FOUND : EXIT_ERROR;
  }
}

async function cmdRemove(io: CliIO, positionals: string[], flags: Record<string, string | boolean>): Promise<number> {
  const token = positionals[0];
  if (!token) {
    io.stderr("Usage: promptdeck rm <command-or-id>");
    return EXIT_ERROR;
  }
  try {
    const library = libraryFrom(io, flags);
    const existing = library.resolve(token)?.prompt;
    if (!existing) throw new Error(`No prompt found for "${token}".`);
    if (io.stdinIsTTY() && !flagBool(flags, "yes")) {
      const confirmed = await io.confirm(`Delete ${existing.command}? [y/N] `);
      if (!confirmed) {
        io.stderr("Aborted.");
        return EXIT_OK;
      }
    }
    const removed = library.removePrompt(token);
    io.stderr(`Removed ${removed.command} (${removed.id}).`);
    return EXIT_OK;
  } catch (err) {
    const message = err instanceof Error ? err.message : "Could not remove the prompt.";
    io.stderr(message);
    return message.startsWith("No prompt found") ? EXIT_NOT_FOUND : EXIT_ERROR;
  }
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

function cmdPrint(
  io: CliIO,
  positionals: string[],
  flags: Record<string, string | boolean>,
  lists: Record<string, string[]>
): number {
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
  const vars = collectValues(io, flags, lists);
  if (vars.error) {
    io.stderr(vars.error);
    return EXIT_ERROR;
  }
  const { content, missingRequired } = compileResolved(resolution, vars);
  if (missingRequired.length && flagBool(flags, "strict")) {
    io.stderr(`Missing required variables: ${missingRequired.join(", ")}`);
    return EXIT_ERROR;
  }
  if (missingRequired.length) io.stderr(`Warning: unfilled variables: ${missingRequired.join(", ")}`);
  io.stdout(content);
  return EXIT_OK;
}

function copyResolved(io: CliIO, library: PromptLibrary, token: string, vars?: VariableValues, strict = false): number {
  const resolution = library.resolve(token);
  if (!resolution) {
    io.stderr(`No prompt found for "${token}".`);
    return EXIT_NOT_FOUND;
  }
  const { content, missingRequired } = compileResolved(resolution, vars || { values: {}, provided: false });
  if (missingRequired.length && strict) {
    io.stderr(`Missing required variables: ${missingRequired.join(", ")}`);
    return EXIT_ERROR;
  }
  if (!io.clipboardAvailable()) {
    io.stderr("Clipboard is not available. Use `promptdeck print` to write to stdout instead.");
    return EXIT_CLIPBOARD;
  }
  const result = io.copy(content);
  if (!result.ok) {
    io.stderr(result.reason || "Failed to copy to clipboard.");
    return EXIT_CLIPBOARD;
  }
  library.recordUsage(resolution.prompt.id);
  const label = resolution.resolved.suffix ? `${resolution.prompt.command}:${resolution.resolved.suffix}` : resolution.prompt.command;
  io.stderr(`Copied ${label} to the clipboard.`);
  if (missingRequired.length) io.stderr(`Warning: unfilled variables: ${missingRequired.join(", ")}`);
  return EXIT_OK;
}

function cmdCopy(
  io: CliIO,
  positionals: string[],
  flags: Record<string, string | boolean>,
  lists: Record<string, string[]>
): number {
  const token = positionals[0];
  if (!token) {
    io.stderr("Usage: promptdeck copy <command-or-id>[:variant-or-version]");
    return EXIT_ERROR;
  }
  const vars = collectValues(io, flags, lists);
  if (vars.error) {
    io.stderr(vars.error);
    return EXIT_ERROR;
  }
  return copyResolved(io, libraryFrom(io, flags), token, vars, flagBool(flags, "strict"));
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

  const library = libraryFrom(io, flags);

  if (flagBool(flags, "dry-run")) {
    try {
      const { plan, warnings } = library.planImport(raw);
      const summary = plan.summary;
      if (flagBool(flags, "json")) {
        io.stdout(JSON.stringify({ mode, ...summary }, null, 2));
        return EXIT_OK;
      }
      io.stdout(`Dry run (${mode}) — no changes written:`);
      io.stdout(`  prompts in backup:        ${summary.promptCount}`);
      io.stdout(`  new:                      ${summary.newPromptCount}`);
      io.stdout(`  merged (added versions):  ${summary.mergedPromptCount}`);
      io.stdout(`  unchanged:                ${summary.unchangedPromptCount}`);
      io.stdout(`  conflicts:                ${summary.conflictCount}`);
      io.stdout(`  conflicts newer locally:  ${summary.newerLocalCount}`);
      warnings.forEach((warning) => io.stderr(`Warning: ${warning}`));
      return EXIT_OK;
    } catch (error) {
      io.stderr(error instanceof Error ? error.message : "Import preview failed.");
      return EXIT_ERROR;
    }
  }

  try {
    const result = library.importBackup(raw, mode);
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
  const { positionals, flags, lists } = parseArgs(argv, {
    booleans: ["json", "help", "version", "yes", "strict", "minor", "new-version", "dry-run", "edit"],
    arrays: ["var", "alias"]
  });
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
      return cmdCopy(io, positionals, flags, lists);
    case "print":
      return cmdPrint(io, positionals, flags, lists);
    case "add":
      return cmdAdd(io, positionals, flags, lists);
    case "edit":
      return cmdEdit(io, positionals, flags, lists);
    case "rm":
    case "remove":
      return cmdRemove(io, positionals, flags);
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
    readStdin: () => fs.readFileSync(0, "utf8"),
    stdinIsTTY: () => Boolean(process.stdin.isTTY),
    confirm: async (question) => {
      const rl = createInterface({ input: process.stdin, output: process.stderr });
      try {
        const answer = await rl.question(question);
        return answer.trim().toLowerCase() === "y" || answer.trim().toLowerCase() === "yes";
      } finally {
        rl.close();
      }
    },
    editInEditor: async (initial, ext = ".tmp") => {
      const dir = fs.mkdtempSync(path.join(os.tmpdir(), "promptdeck-edit-"));
      const filePath = path.join(dir, `prompt${ext}`);
      try {
        fs.writeFileSync(filePath, initial, "utf8");
        const editor = process.env.EDITOR || process.env.VISUAL || "vi";
        const code = await new Promise<number | null>((resolve) => {
          const child = spawn(editor, [filePath], { stdio: "inherit", shell: true });
          child.on("error", () => resolve(1));
          child.on("close", resolve);
        });
        if (code !== 0) return undefined;
        return fs.readFileSync(filePath, "utf8");
      } finally {
        fs.rmSync(dir, { recursive: true, force: true });
      }
    },
    platform: process.platform,
    ...overrides
  };
}
