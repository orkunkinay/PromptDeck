import { defaultSettings } from "../settings/defaultSettings";
import { BACKUP_APP_VERSION, BACKUP_KIND, BACKUP_SCHEMA_VERSION, type PromptDeckBackup } from "./types";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

export function migrateBackupToCurrent(raw: unknown): PromptDeckBackup {
  if (!isRecord(raw)) throw new Error("This file is not a PromptDeck backup.");

  const kind = raw.kind;
  if (kind !== BACKUP_KIND) throw new Error("This file is not a PromptDeck backup.");

  const schemaVersion = Number(raw.schemaVersion);
  if (!Number.isFinite(schemaVersion)) throw new Error("This backup is missing a supported schema version.");
  if (schemaVersion > BACKUP_SCHEMA_VERSION) {
    throw new Error("This backup was created by a newer version of PromptDeck and cannot be imported safely.");
  }

  if (schemaVersion <= 0) {
    const data = isRecord(raw.data) ? raw.data : {};
    return {
      kind: BACKUP_KIND,
      schemaVersion: BACKUP_SCHEMA_VERSION,
      appVersion: typeof raw.appVersion === "string" ? raw.appVersion : BACKUP_APP_VERSION,
      exportedAt: typeof raw.exportedAt === "string" ? raw.exportedAt : new Date(0).toISOString(),
      data: {
        prompts: Array.isArray(data.prompts) ? (data.prompts as PromptDeckBackup["data"]["prompts"]) : [],
        settings: isRecord(data.settings) ? { ...defaultSettings, ...data.settings, telemetryEnabled: false } : undefined
      }
    };
  }

  return raw as unknown as PromptDeckBackup;
}
