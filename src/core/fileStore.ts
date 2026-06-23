import fs from "node:fs";
import path from "node:path";
import type { Prompt, PromptDeckSettings } from "../shared/models/prompt";
import { ensureVariableDefinitions } from "../shared/promptCompiler/compiler";
import { defaultSettings } from "../shared/settings/defaultSettings";
import { seedPrompts } from "../shared/seedPrompts";
import { nowIso } from "../shared/utils/id";
import { resolveLibraryPath } from "./paths";

export const LIBRARY_KIND = "promptdeck.library";
export const LIBRARY_SCHEMA_VERSION = 1;

/**
 * On-disk shape of the local-first library file. This is intentionally close
 * to the backup format but uses its own `kind` so the two are never confused.
 * Prompts use the exact same {@link Prompt} model as the browser extension, so
 * backups round-trip without data loss.
 */
export interface LibraryFile {
  kind: typeof LIBRARY_KIND;
  schemaVersion: number;
  updatedAt: string;
  prompts: Prompt[];
  settings: PromptDeckSettings;
}

export interface FileStoreOptions {
  /** Absolute path to the library JSON file. Defaults to the resolved local path. */
  path?: string;
  /** Seed example prompts when creating a brand new library file. Defaults to true. */
  seed?: boolean;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

/**
 * Bring a stored prompt up to the current model shape without losing data.
 * Mirrors the defensive normalization the browser repository applies so the
 * same prompts behave identically across surfaces.
 */
export function normalizePrompt(prompt: Prompt): Prompt {
  const defaultVersion =
    prompt.versions?.find((version) => version.id === prompt.defaultVersionId) || prompt.versions?.[0];
  const content = defaultVersion?.content || prompt.body || "";
  return {
    ...prompt,
    command: prompt.command.startsWith("/") ? prompt.command : `/${prompt.command}`,
    aliases: (prompt.aliases || []).map((alias) => (alias.startsWith("/") ? alias : `/${alias}`)),
    tags: prompt.tags || [],
    variants: prompt.variants || [],
    versions: prompt.versions || [],
    defaultVersionId: defaultVersion?.id || prompt.defaultVersionId || "v1",
    body: prompt.body || content,
    variables: ensureVariableDefinitions(content, prompt.variables || {}),
    createdAt: prompt.createdAt || nowIso(),
    updatedAt: prompt.updatedAt || nowIso(),
    usageCount: prompt.usageCount || 0
  };
}

export function createLibraryFile(prompts: Prompt[], settings: PromptDeckSettings = defaultSettings): LibraryFile {
  return {
    kind: LIBRARY_KIND,
    schemaVersion: LIBRARY_SCHEMA_VERSION,
    updatedAt: nowIso(),
    prompts: prompts.map(normalizePrompt),
    settings
  };
}

function coerceLibrary(raw: unknown): LibraryFile {
  if (!isRecord(raw) || !Array.isArray(raw.prompts)) {
    throw new Error("Library file is not a valid PromptDeck library.");
  }
  const settings = isRecord(raw.settings)
    ? ({ ...defaultSettings, ...raw.settings, telemetryEnabled: false } as PromptDeckSettings)
    : defaultSettings;
  return {
    kind: LIBRARY_KIND,
    schemaVersion: typeof raw.schemaVersion === "number" ? raw.schemaVersion : LIBRARY_SCHEMA_VERSION,
    updatedAt: typeof raw.updatedAt === "string" ? raw.updatedAt : nowIso(),
    prompts: (raw.prompts as Prompt[]).map(normalizePrompt),
    settings
  };
}

/**
 * A simple, synchronous, versioned JSON file store. Synchronous reads/writes
 * keep the CLI fast and predictable; the library files are small.
 */
export class FileStore {
  readonly path: string;
  private readonly seed: boolean;

  constructor(options: FileStoreOptions = {}) {
    this.path = options.path || resolveLibraryPath();
    this.seed = options.seed ?? true;
  }

  exists(): boolean {
    return fs.existsSync(this.path);
  }

  /** Load the library, creating (and optionally seeding) the file on first use. */
  load(): LibraryFile {
    if (!this.exists()) {
      const seeded = this.seed ? seedPrompts : [];
      const library = createLibraryFile(seeded);
      this.write(library);
      return library;
    }
    const raw = fs.readFileSync(this.path, "utf8");
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      throw new Error(`Library file at ${this.path} is not valid JSON.`);
    }
    return coerceLibrary(parsed);
  }

  write(library: LibraryFile): void {
    const dir = path.dirname(this.path);
    fs.mkdirSync(dir, { recursive: true });
    const next: LibraryFile = { ...library, updatedAt: nowIso() };
    fs.writeFileSync(this.path, `${JSON.stringify(next, null, 2)}\n`, "utf8");
  }
}
