import type { PromptDeckExport } from "../models/prompt";
import { CURRENT_SCHEMA_VERSION } from "../settings/defaultSettings";

export interface MigrationResult {
  schemaVersion: number;
  data: PromptDeckExport;
}

export function migrateExport(input: PromptDeckExport): MigrationResult {
  let data: PromptDeckExport = { ...input };
  const version = Number(data.schemaVersion || 0);

  if (version > CURRENT_SCHEMA_VERSION) {
    throw new Error(`Export schema ${version} is newer than this app supports (${CURRENT_SCHEMA_VERSION}).`);
  }

  if (version < 1) {
    data = {
      ...data,
      schemaVersion: 1,
      prompts: (data.prompts || []).map((prompt) => ({
        ...prompt,
        variables: prompt.variables || {},
        variants: prompt.variants || [],
        versions: prompt.versions || [],
        aliases: prompt.aliases || [],
        tags: prompt.tags || [],
        usageCount: prompt.usageCount || 0
      }))
    };
  }

  return { schemaVersion: CURRENT_SCHEMA_VERSION, data: { ...data, schemaVersion: CURRENT_SCHEMA_VERSION } };
}
