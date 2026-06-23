import type { Prompt } from "../shared/models/prompt";
import { searchPrompts, type SearchResult } from "../shared/search/fuzzySearch";
import {
  applyImportPlanToState,
  createBackup,
  createImportPlan,
  stringifyBackup,
  validateBackup,
  type ImportMode,
  type ImportResult,
  type PromptDeckBackup
} from "../shared/backup";
import { nowIso } from "../shared/utils/id";
import { FileStore, LIBRARY_SCHEMA_VERSION, normalizePrompt, type FileStoreOptions } from "./fileStore";
import { resolveToken, type TokenResolution } from "./resolve";

export interface ImportSummary extends ImportResult {
  warnings: string[];
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
   * Import a parsed PromptDeck backup into the local store. Validates and
   * migrates the backup, then applies the same merge/replace logic the browser
   * manager uses.
   */
  importBackup(raw: unknown, mode: ImportMode = "merge-safe"): ImportSummary {
    const validation = validateBackup(raw);
    if (!validation.ok) {
      throw new Error(validation.errors.join("\n"));
    }
    const library = this.store.load();
    const plan = createImportPlan(library.prompts, library.settings, validation.backup);
    const result = applyImportPlanToState(plan, mode);
    this.store.write({
      kind: library.kind,
      schemaVersion: library.schemaVersion,
      updatedAt: nowIso(),
      prompts: result.prompts.map(normalizePrompt),
      settings: result.settings
    });
    return { ...result, warnings: validation.warnings };
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
