import type { Prompt, PromptDeckSettings } from "../models/prompt";

export const BACKUP_KIND = "promptdeck.backup";
export const BACKUP_SCHEMA_VERSION = 1;
export const BACKUP_APP_VERSION = "0.1.0";

export interface BackupData {
  prompts: Prompt[];
  settings?: PromptDeckSettings;
}

export interface PromptDeckBackup {
  kind: typeof BACKUP_KIND;
  schemaVersion: number;
  appVersion: string;
  exportedAt: string;
  data: BackupData;
}

export type ImportMode = "merge-safe" | "merge-update" | "replace";

export interface ImportConflict {
  importedPromptId: string;
  localPromptId: string;
  reason: "id" | "command";
  localUpdatedAt?: string;
  importedUpdatedAt?: string;
  localVersionCount: number;
  importedVersionCount: number;
  localIsNewer: boolean;
}

export interface ImportMerge {
  importedPromptId: string;
  localPromptId: string;
  prompt: Prompt;
  addedVersionCount: number;
}

export interface ImportPreviewSummary {
  promptCount: number;
  versionCount: number;
  settingsIncluded: boolean;
  newPromptCount: number;
  unchangedPromptCount: number;
  mergedPromptCount: number;
  conflictCount: number;
  newerLocalCount: number;
  settingsChangeCount: number;
}

export interface ImportPlan {
  backup: PromptDeckBackup;
  currentPrompts: Prompt[];
  currentSettings: PromptDeckSettings;
  newPrompts: Prompt[];
  unchangedPrompts: Prompt[];
  mergedPrompts: ImportMerge[];
  conflicts: ImportConflict[];
  summary: ImportPreviewSummary;
}

export interface ImportResult {
  prompts: Prompt[];
  settings: PromptDeckSettings;
  importedPromptCount: number;
  mergedPromptCount: number;
  skippedConflictCount: number;
  replacedPromptCount: number;
  mode: ImportMode;
}

export interface ValidationSuccess {
  ok: true;
  backup: PromptDeckBackup;
  warnings: string[];
}

export interface ValidationFailure {
  ok: false;
  errors: string[];
  warnings: string[];
}

export type ValidationResult = ValidationSuccess | ValidationFailure;
