import type { Prompt, PromptVersion } from "../shared/models/prompt";
import { searchPrompts, type SearchResult } from "../shared/search/fuzzySearch";
import {
  applyImportPlanToState,
  createBackup,
  createImportPlan,
  stringifyBackup,
  validateBackup,
  type ImportMode,
  type ImportPlan,
  type ImportResult,
  type PromptDeckBackup
} from "../shared/backup";
import { ensureVariableDefinitions } from "../shared/promptCompiler/compiler";
import { createVersion } from "../shared/versioning/versionService";
import { commandToId, limitPromptTitle, nowIso, titleFromCommand } from "../shared/utils/id";
import { FileStore, LIBRARY_SCHEMA_VERSION, normalizePrompt, type FileStoreOptions } from "./fileStore";
import { findPromptExact, parseToken, resolveToken, type TokenResolution } from "./resolve";

export interface ImportSummary extends ImportResult {
  warnings: string[];
}

export interface ImportPlanResult {
  plan: ImportPlan;
  warnings: string[];
}

export interface AddPromptInput {
  command: string;
  title?: string;
  aliases?: string[];
  tags?: string[];
  description?: string;
  content?: string;
}

export interface UpdatePromptInput {
  title?: string;
  aliases?: string[];
  tags?: string[];
  description?: string;
  content?: string;
  /** Edit the default version in place instead of creating a new version. */
  minor?: boolean;
  changelog?: string;
}

function withSlash(value: string): string {
  return value.startsWith("/") ? value : `/${value}`;
}

function commandTokens(prompt: Pick<Prompt, "command" | "aliases">): Set<string> {
  return new Set([prompt.command, ...prompt.aliases].map((value) => value.toLowerCase()));
}

/** Throw if the candidate's command or any alias collides with another prompt. */
function assertNoCollision(others: Prompt[], candidate: Prompt): void {
  const candidateTokens = commandTokens(candidate);
  for (const other of others) {
    for (const token of commandTokens(other)) {
      if (candidateTokens.has(token)) {
        throw new Error(`Command collision with "${other.title}" on "${token}". Choose a different command or alias.`);
      }
    }
  }
}

export interface DoctorReport {
  libraryPath: string;
  libraryExists: boolean;
  promptCount: number;
  versionCount: number;
  variantCount: number;
  schemaVersion: number;
  settingsTrigger: string;
}

/**
 * High-level façade over the local file store. Shared by the CLI and the VS
 * Code extension so both surfaces behave identically. All ranking, resolution,
 * and backup logic is reused from the platform-neutral `shared` core.
 */
export class PromptLibrary {
  readonly store: FileStore;

  constructor(options: FileStoreOptions = {}) {
    this.store = new FileStore(options);
  }

  get path(): string {
    return this.store.path;
  }

  list(): Prompt[] {
    return this.store.load().prompts;
  }

  search(query: string, host?: string): SearchResult[] {
    return searchPrompts(this.list(), query, host);
  }

  resolve(token: string): TokenResolution | undefined {
    return resolveToken(this.list(), token);
  }

  /** Create a new prompt from a command, enforcing command/alias uniqueness. */
  addPrompt(input: AddPromptInput): Prompt {
    const library = this.store.load();
    const command = withSlash(input.command);
    const id = commandToId(command);
    if (!id) throw new Error("A command is required.");
    if (library.prompts.some((prompt) => prompt.id === id)) {
      throw new Error(`A prompt with id "${id}" already exists. Use "edit" to change it.`);
    }
    const now = nowIso();
    const content = input.content ?? "";
    const version: PromptVersion = {
      id: "v1",
      promptId: id,
      label: "Original",
      content,
      changelog: "Created prompt",
      createdAt: now,
      createdBy: "local user",
      isDefault: true
    };
    const prompt: Prompt = normalizePrompt({
      id,
      title: input.title ? limitPromptTitle(input.title) : titleFromCommand(command),
      command,
      aliases: (input.aliases || []).map(withSlash),
      tags: input.tags || [],
      description: input.description || "",
      defaultVersionId: "v1",
      versions: [version],
      variants: [],
      variables: ensureVariableDefinitions(content),
      createdAt: now,
      updatedAt: now,
      usageCount: 0
    });
    assertNoCollision(library.prompts, prompt);
    library.prompts.push(prompt);
    this.store.write(library);
    return prompt;
  }

  /** Update a prompt's metadata and/or content, addressed by command/id/alias. */
  updatePrompt(token: string, changes: UpdatePromptInput): Prompt {
    const library = this.store.load();
    const existing = findPromptExact(library.prompts, parseToken(token).name);
    if (!existing) throw new Error(`No prompt found for "${token}".`);

    let next: Prompt = { ...existing };
    if (changes.title !== undefined) next.title = limitPromptTitle(changes.title);
    if (changes.description !== undefined) next.description = changes.description;
    if (changes.tags !== undefined) next.tags = changes.tags;
    if (changes.aliases !== undefined) next.aliases = changes.aliases.map(withSlash);

    if (changes.content !== undefined) {
      if (changes.minor) {
        next.versions = next.versions.map((version) =>
          version.id === next.defaultVersionId ? { ...version, content: changes.content as string } : version
        );
      } else {
        next = createVersion(next, changes.content, changes.changelog || "Saved edit");
      }
      next.variables = ensureVariableDefinitions(changes.content, next.variables);
      next.body = changes.content;
    }
    next.updatedAt = nowIso();

    const normalized = normalizePrompt(next);
    assertNoCollision(
      library.prompts.filter((prompt) => prompt.id !== existing.id),
      normalized
    );
    library.prompts = library.prompts.map((prompt) => (prompt.id === existing.id ? normalized : prompt));
    this.store.write(library);
    return normalized;
  }

  /** Remove a prompt addressed by command/id/alias. Returns the removed prompt. */
  removePrompt(token: string): Prompt {
    const library = this.store.load();
    const existing = findPromptExact(library.prompts, parseToken(token).name);
    if (!existing) throw new Error(`No prompt found for "${token}".`);
    library.prompts = library.prompts.filter((prompt) => prompt.id !== existing.id);
    this.store.write(library);
    return existing;
  }

  /** Increment usage stats for a prompt and persist. Best-effort. */
  recordUsage(promptId: string): void {
    const library = this.store.load();
    const prompt = library.prompts.find((candidate) => candidate.id === promptId);
    if (!prompt) return;
    const now = nowIso();
    prompt.usageCount = (prompt.usageCount || 0) + 1;
    prompt.useCount = (prompt.useCount || prompt.usageCount || 0) + 1;
    prompt.lastUsedAt = now;
    this.store.write(library);
  }

  /** Export the current library as a PromptDeck-compatible backup. */
  exportBackup(): PromptDeckBackup {
    const library = this.store.load();
    return createBackup(library.prompts, library.settings);
  }

  exportBackupString(): string {
    return stringifyBackup(this.exportBackup());
  }

  /**
   * Validate a backup and compute the import plan against the current library
   * without writing anything. Used for `--dry-run` previews.
   */
  planImport(raw: unknown): ImportPlanResult {
    const validation = validateBackup(raw);
    if (!validation.ok) {
      throw new Error(validation.errors.join("\n"));
    }
    const library = this.store.load();
    const plan = createImportPlan(library.prompts, library.settings, validation.backup);
    return { plan, warnings: validation.warnings };
  }

  /**
   * Import a parsed PromptDeck backup into the local store. Validates and
   * migrates the backup, then applies the same merge/replace logic the browser
   * manager uses.
   */
  importBackup(raw: unknown, mode: ImportMode = "merge-safe"): ImportSummary {
    const { plan, warnings } = this.planImport(raw);
    const result = applyImportPlanToState(plan, mode);
    const library = this.store.load();
    this.store.write({
      kind: library.kind,
      schemaVersion: library.schemaVersion,
      updatedAt: nowIso(),
      prompts: result.prompts.map(normalizePrompt),
      settings: result.settings
    });
    return { ...result, warnings };
  }

  doctor(): DoctorReport {
    const exists = this.store.exists();
    const library = this.store.load();
    return {
      libraryPath: this.path,
      libraryExists: exists,
      promptCount: library.prompts.length,
      versionCount: library.prompts.reduce((count, prompt) => count + prompt.versions.length, 0),
      variantCount: library.prompts.reduce((count, prompt) => count + prompt.variants.length, 0),
      schemaVersion: library.schemaVersion || LIBRARY_SCHEMA_VERSION,
      settingsTrigger: library.settings.trigger
    };
  }
}
