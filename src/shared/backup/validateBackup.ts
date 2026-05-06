import type { Prompt, PromptDeckSettings } from "../models/prompt";
import { defaultSettings } from "../settings/defaultSettings";
import { migrateBackupToCurrent } from "./migrateBackup";
import { BACKUP_KIND, BACKUP_SCHEMA_VERSION, type PromptDeckBackup, type ValidationResult } from "./types";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isString(value: unknown): value is string {
  return typeof value === "string" && value.length > 0;
}

function validatePrompt(raw: unknown, index: number): { prompt?: Prompt; errors: string[] } {
  const errors: string[] = [];
  if (!isRecord(raw)) return { errors: [`Prompt ${index + 1} is not an object.`] };

  if (!isString(raw.id)) errors.push(`Prompt ${index + 1} is missing an id.`);
  if (!isString(raw.title)) errors.push(`Prompt ${index + 1} is missing a title.`);
  if (!isString(raw.command)) errors.push(`Prompt ${index + 1} is missing a command.`);
  if (!Array.isArray(raw.versions) || raw.versions.length === 0) errors.push(`Prompt ${index + 1} has no version history.`);

  const versions = Array.isArray(raw.versions) ? raw.versions : [];
  versions.forEach((version, versionIndex) => {
    if (!isRecord(version)) {
      errors.push(`Prompt ${index + 1} version ${versionIndex + 1} is damaged.`);
      return;
    }
    if (!isString(version.id)) errors.push(`Prompt ${index + 1} version ${versionIndex + 1} is missing an id.`);
    if (typeof version.content !== "string") errors.push(`Prompt ${index + 1} version ${versionIndex + 1} is missing content.`);
  });

  if (errors.length > 0) return { errors };

  const prompt = raw as unknown as Prompt;
  return {
    prompt: {
      ...prompt,
      aliases: Array.isArray(prompt.aliases) ? prompt.aliases : [],
      tags: Array.isArray(prompt.tags) ? prompt.tags : [],
      variants: Array.isArray(prompt.variants) ? prompt.variants : [],
      variables: prompt.variables || {},
      usageCount: prompt.usageCount || prompt.useCount || 0,
      useCount: prompt.useCount || prompt.usageCount || 0
    },
    errors
  };
}

function normalizeSettings(raw: unknown): PromptDeckSettings | undefined {
  if (!isRecord(raw)) return undefined;
  return {
    ...defaultSettings,
    ...raw,
    telemetryEnabled: false
  } as PromptDeckSettings;
}

export function validateBackup(raw: unknown): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  let migrated: PromptDeckBackup;
  try {
    migrated = migrateBackupToCurrent(raw);
  } catch (error) {
    return { ok: false, errors: [error instanceof Error ? error.message : "This backup could not be read."], warnings };
  }

  if (migrated.kind !== BACKUP_KIND) errors.push("This file is not a PromptDeck backup.");
  if (migrated.schemaVersion !== BACKUP_SCHEMA_VERSION) errors.push("This backup schema is not supported.");
  if (!isRecord(migrated.data)) errors.push("This backup is missing its data section.");
  if (!Array.isArray(migrated.data?.prompts)) errors.push("This backup is missing a prompts array.");

  const prompts: Prompt[] = [];
  if (Array.isArray(migrated.data?.prompts)) {
    migrated.data.prompts.forEach((prompt, index) => {
      const result = validatePrompt(prompt, index);
      if (result.prompt) prompts.push(result.prompt);
      errors.push(...result.errors);
    });
  }

  if (prompts.length === 0 && errors.length === 0) errors.push("This backup is empty.");

  if (errors.length > 0) {
    const damaged = errors.filter((error) => error.startsWith("Prompt ")).length;
    if (damaged > 0) {
      return { ok: false, errors: [`This backup is damaged: ${damaged} prompt record issues were found.`, ...errors], warnings };
    }
    return { ok: false, errors, warnings };
  }

  return {
    ok: true,
    warnings,
    backup: {
      ...migrated,
      data: {
        prompts,
        settings: normalizeSettings(migrated.data.settings)
      }
    }
  };
}
