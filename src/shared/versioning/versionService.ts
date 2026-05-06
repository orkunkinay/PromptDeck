import type { Prompt, PromptVersion, ResolvedPromptContent } from "../models/prompt";
import { nowIso } from "../utils/id";

export function nextVersionId(prompt: Pick<Prompt, "versions">): string {
  const max = prompt.versions.reduce((highest, version) => {
    const match = /^v(\d+)$/i.exec(version.id);
    return match ? Math.max(highest, Number(match[1])) : highest;
  }, 0);
  return `v${max + 1}`;
}

export function getDefaultVersion(prompt: Prompt): PromptVersion {
  return prompt.versions.find((version) => version.id === prompt.defaultVersionId) || prompt.versions[0];
}

export function createVersion(prompt: Prompt, content: string, changelog = "Saved edit", label = "Current default"): Prompt {
  const createdAt = nowIso();
  const version: PromptVersion = {
    id: nextVersionId(prompt),
    promptId: prompt.id,
    label,
    content,
    changelog,
    createdAt,
    createdBy: "local user",
    isDefault: true
  };
  const versions: PromptVersion[] = [...prompt.versions.map((existing) => ({ ...existing, isDefault: false })), version];
  return {
    ...prompt,
    versions,
    defaultVersionId: version.id,
    updatedAt: createdAt
  };
}

export function setDefaultVersion(prompt: Prompt, versionId: string): Prompt {
  if (!prompt.versions.some((version) => version.id === versionId)) {
    throw new Error(`Version ${versionId} was not found.`);
  }
  return {
    ...prompt,
    defaultVersionId: versionId,
    versions: prompt.versions.map((version) => ({ ...version, isDefault: version.id === versionId })),
    updatedAt: nowIso()
  };
}

export function restoreVersionAsLatest(prompt: Prompt, versionId: string): Prompt {
  const version = prompt.versions.find((candidate) => candidate.id === versionId);
  if (!version) throw new Error(`Version ${versionId} was not found.`);
  return createVersion(prompt, version.content, `Restored from ${version.id}`, `Restored ${version.id}`);
}

export function deleteVersion(prompt: Prompt, versionId: string): Prompt {
  if (prompt.versions.length <= 1) {
    throw new Error("A prompt must keep at least one version.");
  }
  if (!prompt.versions.some((version) => version.id === versionId)) {
    throw new Error(`Version ${versionId} was not found.`);
  }

  const versions = prompt.versions.filter((version) => version.id !== versionId);
  const nextDefaultId = prompt.defaultVersionId === versionId ? versions[versions.length - 1].id : prompt.defaultVersionId;

  return {
    ...prompt,
    defaultVersionId: nextDefaultId,
    versions: versions.map((version) => ({ ...version, isDefault: version.id === nextDefaultId })),
    updatedAt: nowIso()
  };
}

export function renameVersion(prompt: Prompt, versionId: string, label: string, changelog?: string): Prompt {
  return {
    ...prompt,
    versions: prompt.versions.map((version) =>
      version.id === versionId ? { ...version, label, changelog: changelog ?? version.changelog } : version
    ),
    updatedAt: nowIso()
  };
}

export function resolvePromptContent(prompt: Prompt, suffix?: string): ResolvedPromptContent {
  if (!suffix) {
    const version = getDefaultVersion(prompt);
    return { prompt, kind: "default", version, content: version.content };
  }

  const exactVersion = prompt.versions.find((version) => version.id.toLowerCase() === suffix.toLowerCase());
  if (exactVersion) {
    return { prompt, kind: "version", suffix, version: exactVersion, content: exactVersion.content };
  }

  const exactVariant = prompt.variants.find(
    (variant) => variant.suffix.toLowerCase() === suffix.toLowerCase() || variant.name.toLowerCase() === suffix.toLowerCase()
  );
  if (exactVariant) {
    return { prompt, kind: "variant", suffix, variant: exactVariant, content: exactVariant.content };
  }

  const version = getDefaultVersion(prompt);
  return { prompt, kind: "default", suffix, version, content: version.content };
}

export interface DiffLine {
  type: "same" | "add" | "remove";
  text: string;
}

export function diffLines(left: string, right: string): DiffLine[] {
  const a = left.split("\n");
  const b = right.split("\n");
  const rows = a.length + 1;
  const cols = b.length + 1;
  const dp = Array.from({ length: rows }, () => Array<number>(cols).fill(0));

  for (let i = a.length - 1; i >= 0; i -= 1) {
    for (let j = b.length - 1; j >= 0; j -= 1) {
      dp[i][j] = a[i] === b[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
    }
  }

  const output: DiffLine[] = [];
  let i = 0;
  let j = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) {
      output.push({ type: "same", text: a[i] });
      i += 1;
      j += 1;
    } else if (dp[i + 1][j] >= dp[i][j + 1]) {
      output.push({ type: "remove", text: a[i] });
      i += 1;
    } else {
      output.push({ type: "add", text: b[j] });
      j += 1;
    }
  }
  while (i < a.length) output.push({ type: "remove", text: a[i++] });
  while (j < b.length) output.push({ type: "add", text: b[j++] });
  return output;
}
