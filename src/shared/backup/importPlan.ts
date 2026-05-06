import type { Prompt, PromptDeckSettings, PromptVersion } from "../models/prompt";
import { defaultSettings } from "../settings/defaultSettings";
import type { ImportConflict, ImportMerge, ImportMode, ImportPlan, ImportResult, PromptDeckBackup } from "./types";

function commandKey(command?: string): string {
  return (command || "").toLowerCase();
}

function isNewer(local?: string, imported?: string): boolean {
  if (!local || !imported) return false;
  return new Date(local).getTime() > new Date(imported).getTime();
}

function settingsChangeCount(current: PromptDeckSettings, imported?: PromptDeckSettings): number {
  if (!imported) return 0;
  const keys: Array<keyof PromptDeckSettings> = ["theme", "trigger", "insertionMode", "rememberVariableValues"];
  return keys.filter((key) => JSON.stringify(current[key]) !== JSON.stringify(imported[key])).length;
}

function sortedStrings(values: string[] = []): string[] {
  return [...values].sort((a, b) => a.localeCompare(b));
}

function canonicalPromptMetadata(prompt: Prompt): unknown {
  return {
    title: prompt.title,
    command: prompt.command,
    aliases: sortedStrings(prompt.aliases),
    tags: sortedStrings(prompt.tags),
    description: prompt.description || "",
    variants: [...(prompt.variants || [])]
      .map((variant) => ({
        id: variant.id,
        name: variant.name,
        suffix: variant.suffix,
        content: variant.content,
        description: variant.description || ""
      }))
      .sort((a, b) => a.id.localeCompare(b.id))
  };
}

function versionContentMap(versions: PromptVersion[]): Map<string, string> {
  return new Map(versions.map((version) => [version.id, version.content]));
}

function promptMetadataMatches(local: Prompt, imported: Prompt): boolean {
  return JSON.stringify(canonicalPromptMetadata(local)) === JSON.stringify(canonicalPromptMetadata(imported));
}

function compatibleVersions(local: Prompt, imported: Prompt): boolean {
  const localVersions = versionContentMap(local.versions);
  const importedVersions = versionContentMap(imported.versions);
  const commonVersionIds = [...importedVersions.keys()].filter((id) => localVersions.has(id));
  if (commonVersionIds.length === 0) return false;
  return commonVersionIds.every((id) => localVersions.get(id) === importedVersions.get(id));
}

function versionIdSet(prompt: Prompt): Set<string> {
  return new Set(prompt.versions.map((version) => version.id));
}

function sameVersionIds(local: Prompt, imported: Prompt): boolean {
  const localIds = versionIdSet(local);
  const importedIds = versionIdSet(imported);
  return localIds.size === importedIds.size && [...localIds].every((id) => importedIds.has(id));
}

function promptsAreEquivalent(local: Prompt, imported: Prompt): boolean {
  return promptMetadataMatches(local, imported) && compatibleVersions(local, imported) && sameVersionIds(local, imported);
}

function newestVersionId(prompt: Prompt): string {
  return prompt.versions[prompt.versions.length - 1]?.id || prompt.defaultVersionId;
}

function mergeCompatiblePrompt(local: Prompt, imported: Prompt): ImportMerge {
  const localIds = versionIdSet(local);
  const importedOnlyVersions = imported.versions
    .filter((version) => !localIds.has(version.id))
    .map((version) => ({ ...version, promptId: local.id, isDefault: false }));
  const versions = [...local.versions.map((version) => ({ ...version, isDefault: false })), ...importedOnlyVersions];
  const defaultSource = imported.versions.length > local.versions.length ? imported : local;
  const defaultVersionId = versions.some((version) => version.id === defaultSource.defaultVersionId) ? defaultSource.defaultVersionId : newestVersionId({ ...local, versions });

  return {
    importedPromptId: imported.id,
    localPromptId: local.id,
    addedVersionCount: importedOnlyVersions.length,
    prompt: {
      ...local,
      versions: versions.map((version) => ({ ...version, isDefault: version.id === defaultVersionId })),
      defaultVersionId,
      body: versions.find((version) => version.id === defaultVersionId)?.content || local.body,
      updatedAt: isNewer(imported.updatedAt, local.updatedAt) ? imported.updatedAt : local.updatedAt
    }
  };
}

export function createImportPlan(currentPrompts: Prompt[], currentSettings: PromptDeckSettings, backup: PromptDeckBackup): ImportPlan {
  const conflicts: ImportConflict[] = [];
  const newPrompts: Prompt[] = [];
  const unchangedPrompts: Prompt[] = [];
  const mergedPrompts: ImportMerge[] = [];

  for (const imported of backup.data.prompts) {
    const idConflict = currentPrompts.find((prompt) => prompt.id === imported.id);
    const commandConflict = currentPrompts.find((prompt) => prompt.id !== imported.id && commandKey(prompt.command) === commandKey(imported.command));
    const local = idConflict || commandConflict;

    if (!local) {
      newPrompts.push(imported);
      continue;
    }

    if (promptsAreEquivalent(local, imported)) {
      unchangedPrompts.push(imported);
      continue;
    }

    if (promptMetadataMatches(local, imported) && compatibleVersions(local, imported)) {
      const merge = mergeCompatiblePrompt(local, imported);
      if (merge.addedVersionCount > 0) {
        mergedPrompts.push(merge);
      } else {
        unchangedPrompts.push(imported);
      }
      continue;
    }

    conflicts.push({
      importedPromptId: imported.id,
      localPromptId: local.id,
      reason: idConflict ? "id" : "command",
      localUpdatedAt: local.updatedAt,
      importedUpdatedAt: imported.updatedAt,
      localVersionCount: local.versions.length,
      importedVersionCount: imported.versions.length,
      localIsNewer: isNewer(local.updatedAt, imported.updatedAt)
    });
  }

  return {
    backup,
    currentPrompts,
    currentSettings,
    newPrompts,
    unchangedPrompts,
    mergedPrompts,
    conflicts,
    summary: {
      promptCount: backup.data.prompts.length,
      versionCount: backup.data.prompts.reduce((count, prompt) => count + prompt.versions.length, 0),
      settingsIncluded: Boolean(backup.data.settings),
      newPromptCount: newPrompts.length,
      unchangedPromptCount: unchangedPrompts.length,
      mergedPromptCount: mergedPrompts.length,
      conflictCount: conflicts.length,
      newerLocalCount: conflicts.filter((conflict) => conflict.localIsNewer).length,
      settingsChangeCount: settingsChangeCount(currentSettings, backup.data.settings)
    }
  };
}

export function applyImportPlanToState(plan: ImportPlan, mode: ImportMode): ImportResult {
  if (mode === "replace") {
    return {
      prompts: plan.backup.data.prompts,
      settings: plan.backup.data.settings || defaultSettings,
      importedPromptCount: plan.backup.data.prompts.length,
      mergedPromptCount: 0,
      skippedConflictCount: 0,
      replacedPromptCount: plan.currentPrompts.length,
      mode
    };
  }

  const conflicts = new Map(plan.conflicts.map((conflict) => [conflict.importedPromptId, conflict]));
  const unchangedIds = new Set(plan.unchangedPrompts.map((prompt) => prompt.id));
  const merges = new Map(plan.mergedPrompts.map((merge) => [merge.importedPromptId, merge]));
  const resultById = new Map(plan.currentPrompts.map((prompt) => [prompt.id, prompt]));
  let replacedPromptCount = 0;
  let importedPromptCount = 0;
  let mergedPromptCount = 0;
  let skippedConflictCount = 0;

  for (const imported of plan.backup.data.prompts) {
    if (unchangedIds.has(imported.id)) continue;
    const merge = merges.get(imported.id);
    if (merge) {
      resultById.delete(merge.localPromptId);
      resultById.set(merge.prompt.id, merge.prompt);
      mergedPromptCount += 1;
      continue;
    }
    const conflict = conflicts.get(imported.id) || plan.conflicts.find((candidate) => candidate.importedPromptId === imported.id);
    if (!conflict) {
      resultById.set(imported.id, imported);
      importedPromptCount += 1;
      continue;
    }

    if (mode === "merge-safe") {
      skippedConflictCount += 1;
      continue;
    }

    resultById.delete(conflict.localPromptId);
    resultById.set(imported.id, imported);
    replacedPromptCount += 1;
    importedPromptCount += 1;
  }

  return {
    prompts: [...resultById.values()],
    settings: mode === "merge-update" && plan.backup.data.settings ? plan.backup.data.settings : plan.currentSettings,
    importedPromptCount,
    mergedPromptCount,
    skippedConflictCount,
    replacedPromptCount,
    mode
  };
}
