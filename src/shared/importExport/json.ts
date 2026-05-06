import type { Prompt, PromptDeckExport, PromptDeckSettings } from "../models/prompt";
import { CURRENT_SCHEMA_VERSION } from "../settings/defaultSettings";
import { migrateExport } from "../storage/migrations";
import { nowIso } from "../utils/id";

export function exportJson(prompts: Prompt[], settings?: PromptDeckSettings): PromptDeckExport {
  return {
    schemaVersion: CURRENT_SCHEMA_VERSION,
    exportedAt: nowIso(),
    prompts,
    settings
  };
}

export function stringifyExport(data: PromptDeckExport): string {
  return JSON.stringify(data, null, 2);
}

export function parseImportJson(raw: string): PromptDeckExport {
  let parsed: PromptDeckExport;
  try {
    parsed = JSON.parse(raw) as PromptDeckExport;
  } catch {
    throw new Error("Import file is not valid JSON.");
  }

  if (!Array.isArray(parsed.prompts)) {
    throw new Error("Import file must contain a prompts array.");
  }

  for (const prompt of parsed.prompts) {
    if (!prompt.id || !prompt.command || !Array.isArray(prompt.versions)) {
      throw new Error(`Prompt ${prompt.title || prompt.id || "(unknown)"} is missing required fields.`);
    }
  }

  return migrateExport(parsed).data;
}
