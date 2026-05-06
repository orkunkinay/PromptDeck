import type { Prompt, PromptDeckSettings } from "../models/prompt";
import { nowIso } from "../utils/id";
import { BACKUP_APP_VERSION, BACKUP_KIND, BACKUP_SCHEMA_VERSION, type PromptDeckBackup } from "./types";

export function createBackup(prompts: Prompt[], settings?: PromptDeckSettings): PromptDeckBackup {
  return {
    kind: BACKUP_KIND,
    schemaVersion: BACKUP_SCHEMA_VERSION,
    appVersion: BACKUP_APP_VERSION,
    exportedAt: nowIso(),
    data: {
      prompts,
      settings
    }
  };
}

export function backupFilename(date = new Date()): string {
  return `promptdeck-backup-${date.toISOString().slice(0, 10)}.json`;
}

export function stringifyBackup(backup: PromptDeckBackup): string {
  return JSON.stringify(backup, null, 2);
}
