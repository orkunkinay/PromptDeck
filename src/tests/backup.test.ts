import { describe, expect, it } from "vitest";
import {
  BACKUP_KIND,
  BACKUP_SCHEMA_VERSION,
  applyImportPlanToState,
  createBackup,
  createImportPlan,
  migrateBackupToCurrent,
  stringifyBackup,
  validateBackup
} from "../shared/backup";
import type { Prompt, PromptDeckSettings } from "../shared/models/prompt";
import { seedPrompts } from "../shared/seedPrompts";
import { defaultSettings } from "../shared/settings/defaultSettings";

function clonePrompt(prompt: Prompt, patch: Partial<Prompt> = {}): Prompt {
  return JSON.parse(JSON.stringify({ ...prompt, ...patch })) as Prompt;
}

function withVersions(prompt: Prompt, versions: Array<{ id: string; content: string }>, defaultVersionId = versions[versions.length - 1].id): Prompt {
  return clonePrompt(prompt, {
    defaultVersionId,
    body: versions.find((version) => version.id === defaultVersionId)?.content,
    versions: versions.map((version) => ({
      id: version.id,
      promptId: prompt.id,
      label: version.id,
      content: version.content,
      changelog: `Version ${version.id}`,
      createdAt: `2026-05-06T00:00:00.000Z`,
      createdBy: "local user",
      isDefault: version.id === defaultVersionId
    }))
  });
}

const settings: PromptDeckSettings = { ...defaultSettings, trigger: ";;", theme: "dark" };

describe("backup import/export", () => {
  it("exports prompts and settings in a backup envelope", () => {
    const backup = createBackup(seedPrompts, settings);
    expect(backup.kind).toBe(BACKUP_KIND);
    expect(backup.schemaVersion).toBe(BACKUP_SCHEMA_VERSION);
    expect(backup.data.prompts).toHaveLength(seedPrompts.length);
    expect(backup.data.settings?.trigger).toBe(";;");
  });

  it("validates an exported backup", () => {
    const raw = JSON.parse(stringifyBackup(createBackup(seedPrompts, settings))) as unknown;
    const result = validateBackup(raw);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.backup.data.prompts[0].versions[0].content).toBe(seedPrompts[0].versions[0].content);
  });

  it("fails invalid, wrong-kind, future, and corrupted backups clearly", () => {
    expect(validateBackup({}).ok).toBe(false);
    expect(validateBackup({ kind: "other", schemaVersion: 1, data: { prompts: [] } }).ok).toBe(false);
    expect(validateBackup({ kind: BACKUP_KIND, schemaVersion: 999, data: { prompts: [] } }).ok).toBe(false);
    const corrupted = validateBackup({ kind: BACKUP_KIND, schemaVersion: 1, appVersion: "x", exportedAt: "now", data: { prompts: [{}] } });
    expect(corrupted.ok).toBe(false);
    if (!corrupted.ok) expect(corrupted.errors.join(" ")).toContain("damaged");
  });

  it("migrates older backup envelopes", () => {
    const migrated = migrateBackupToCurrent({
      kind: BACKUP_KIND,
      schemaVersion: 0,
      exportedAt: "2026-01-01T00:00:00.000Z",
      data: { prompts: seedPrompts, settings: { trigger: ";;" } }
    });
    expect(migrated.schemaVersion).toBe(BACKUP_SCHEMA_VERSION);
    expect(migrated.data.settings?.trigger).toBe(";;");
  });

  it("merge safely imports only new prompts and skips conflicts", () => {
    const current = [clonePrompt(seedPrompts[0])];
    const importedNew = clonePrompt(seedPrompts[1]);
    const backup = createBackup([clonePrompt(seedPrompts[0]), importedNew], settings);
    const plan = createImportPlan(current, defaultSettings, backup);
    const result = applyImportPlanToState(plan, "merge-safe");
    expect(plan.summary.conflictCount).toBe(0);
    expect(plan.summary.unchangedPromptCount).toBe(1);
    expect(result.prompts.map((prompt) => prompt.id).sort()).toEqual([current[0].id, importedNew.id].sort());
    expect(result.skippedConflictCount).toBe(0);
  });

  it("does not flag identical prompts with identical versions as conflicts", () => {
    const local = clonePrompt(seedPrompts[0], {
      updatedAt: "2026-05-06T10:00:00.000Z",
      lastUsedAt: "2026-05-06T10:05:00.000Z",
      usageCount: 8
    });
    const imported = clonePrompt(seedPrompts[0], {
      updatedAt: "2026-05-01T10:00:00.000Z",
      lastUsedAt: undefined,
      usageCount: 0
    });
    const plan = createImportPlan([local], defaultSettings, createBackup([imported], settings));

    expect(plan.conflicts).toHaveLength(0);
    expect(plan.unchangedPrompts).toHaveLength(1);
    expect(plan.summary.unchangedPromptCount).toBe(1);
  });

  it("merges compatible prompts when the imported backup has more versions", () => {
    const local = withVersions(seedPrompts[0], [{ id: "v1", content: "one" }], "v1");
    const imported = withVersions(
      seedPrompts[0],
      [
        { id: "v1", content: "one" },
        { id: "v2", content: "two" }
      ],
      "v2"
    );
    const plan = createImportPlan([local], defaultSettings, createBackup([imported], settings));
    const result = applyImportPlanToState(plan, "merge-safe");

    expect(plan.summary.conflictCount).toBe(0);
    expect(plan.summary.mergedPromptCount).toBe(1);
    expect(result.mergedPromptCount).toBe(1);
    expect(result.prompts[0].versions.map((version) => version.id)).toEqual(["v1", "v2"]);
    expect(result.prompts[0].defaultVersionId).toBe("v2");
  });

  it("keeps the local prompt when the backup version history is only a subset", () => {
    const local = withVersions(
      seedPrompts[0],
      [
        { id: "v1", content: "one" },
        { id: "v2", content: "two" }
      ],
      "v2"
    );
    const imported = withVersions(seedPrompts[0], [{ id: "v1", content: "one" }], "v1");
    const plan = createImportPlan([local], defaultSettings, createBackup([imported], settings));
    const result = applyImportPlanToState(plan, "merge-safe");

    expect(plan.summary.conflictCount).toBe(0);
    expect(plan.summary.unchangedPromptCount).toBe(1);
    expect(result.prompts[0].versions.map((version) => version.id)).toEqual(["v1", "v2"]);
    expect(result.prompts[0].defaultVersionId).toBe("v2");
  });

  it("merges deleted-version histories when shared versions still match", () => {
    const local = withVersions(
      seedPrompts[0],
      [
        { id: "v1", content: "one" },
        { id: "v3", content: "three" }
      ],
      "v3"
    );
    const imported = withVersions(
      seedPrompts[0],
      [
        { id: "v1", content: "one" },
        { id: "v2", content: "two" }
      ],
      "v2"
    );
    const plan = createImportPlan([local], defaultSettings, createBackup([imported], settings));
    const result = applyImportPlanToState(plan, "merge-safe");

    expect(plan.summary.conflictCount).toBe(0);
    expect(plan.summary.mergedPromptCount).toBe(1);
    expect(result.prompts[0].versions.map((version) => version.id)).toEqual(["v1", "v3", "v2"]);
    expect(result.prompts[0].defaultVersionId).toBe("v3");
  });

  it("still reports a conflict when the same version id has different content", () => {
    const local = withVersions(seedPrompts[0], [{ id: "v1", content: "local" }], "v1");
    const imported = withVersions(seedPrompts[0], [{ id: "v1", content: "imported" }], "v1");
    const plan = createImportPlan([local], defaultSettings, createBackup([imported], settings));

    expect(plan.summary.conflictCount).toBe(1);
  });

  it("merge and update replaces conflicts", () => {
    const local = clonePrompt(seedPrompts[0], { title: "Local title" });
    const imported = clonePrompt(seedPrompts[0], { title: "Imported title" });
    const result = applyImportPlanToState(createImportPlan([local], defaultSettings, createBackup([imported], settings)), "merge-update");
    expect(result.prompts).toHaveLength(1);
    expect(result.prompts[0].title).toBe("Imported title");
    expect(result.settings.theme).toBe("dark");
  });

  it("replace clears existing data and restores backup", () => {
    const result = applyImportPlanToState(createImportPlan([seedPrompts[0]], defaultSettings, createBackup([seedPrompts[1]], settings)), "replace");
    expect(result.prompts).toHaveLength(1);
    expect(result.prompts[0].id).toBe(seedPrompts[1].id);
    expect(result.replacedPromptCount).toBe(1);
  });

  it("detects command conflicts even when ids differ", () => {
    const local = clonePrompt(seedPrompts[0], { id: "local-paper", command: "/paper-reading" });
    const imported = clonePrompt(seedPrompts[0], { id: "imported-paper", command: "/paper-reading", title: "Different imported prompt" });
    const plan = createImportPlan([local], defaultSettings, createBackup([imported], settings));
    expect(plan.conflicts[0].reason).toBe("command");
  });
});
