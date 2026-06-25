import type { Prompt, PromptVariant, PromptVersion } from "../../../src/core";
import { PromptLibrary, resolvePromptContent, resolveToken, serializePromptDocument, type TokenResolution } from "../../../src/core";

/**
 * Pure, vscode-free adapter logic shared by the VS Code extension commands.
 * Kept separate from `extension.ts` so it can be unit-tested without the
 * `vscode` runtime, and so it reuses the exact same resolution as the CLI.
 */

export interface PromptPick {
  /** Display label, e.g. `/paper-reading` or `/paper-reading:short`. */
  label: string;
  /** Secondary text, typically the prompt title (and variant/version name). */
  description: string;
  /** Tertiary detail line, typically the prompt description. */
  detail?: string;
  /** Token to resolve when this item is accepted. */
  token: string;
}

export type PromptTreeNodeKind = "prompt" | "variant" | "version";

export interface PromptTreeNodeData {
  kind: PromptTreeNodeKind;
  id: string;
  label: string;
  description?: string;
  token: string;
  promptCommand: string;
  children: PromptTreeNodeData[];
}

/**
 * Build Quick Pick items for every prompt plus each addressable variant and
 * non-default version, so a user can pick a specific variant directly.
 */
export function buildPromptPicks(prompts: Prompt[]): PromptPick[] {
  const picks: PromptPick[] = [];
  for (const prompt of prompts) {
    picks.push({
      label: prompt.command,
      description: prompt.title,
      detail: prompt.description || undefined,
      token: prompt.command
    });
    for (const variant of prompt.variants) {
      picks.push({
        label: `${prompt.command}:${variant.suffix}`,
        description: `${prompt.title} · ${variant.name}`,
        detail: variant.description || prompt.description || undefined,
        token: `${prompt.command}:${variant.suffix}`
      });
    }
    for (const version of prompt.versions) {
      if (version.id === prompt.defaultVersionId) continue;
      picks.push({
        label: `${prompt.command}:${version.id}`,
        description: `${prompt.title} · ${version.label}`,
        detail: prompt.description || undefined,
        token: `${prompt.command}:${version.id}`
      });
    }
  }
  return picks;
}

export function buildPromptTree(prompts: Prompt[]): PromptTreeNodeData[] {
  return prompts.map((prompt) => {
    const children: PromptTreeNodeData[] = [
      ...prompt.variants.map((variant: PromptVariant) => ({
        kind: "variant" as const,
        id: `${prompt.id}:variant:${variant.id}`,
        label: variant.name,
        description: `:${variant.suffix}`,
        token: `${prompt.command}:${variant.suffix}`,
        promptCommand: prompt.command,
        children: []
      })),
      ...prompt.versions
        .filter((version: PromptVersion) => version.id !== prompt.defaultVersionId)
        .map((version: PromptVersion) => ({
          kind: "version" as const,
          id: `${prompt.id}:version:${version.id}`,
          label: version.label,
          description: version.id,
          token: `${prompt.command}:${version.id}`,
          promptCommand: prompt.command,
          children: []
        }))
    ];
    return {
      kind: "prompt",
      id: prompt.id,
      label: prompt.command,
      description: prompt.title,
      token: prompt.command,
      promptCommand: prompt.command,
      children
    };
  });
}

export function promptResourceName(command: string): string {
  return `${encodeURIComponent(command.replace(/^\//, ""))}.prompt.md`;
}

export function promptCommandFromResourceName(name: string): string {
  const base = name.replace(/\.prompt\.md$/i, "");
  return `/${decodeURIComponent(base).replace(/^\//, "")}`;
}

export function duplicatePromptDocument(prompt: Prompt, content = resolvePromptContent(prompt).content): string {
  const duplicate: Prompt = {
    ...prompt,
    command: `/copy-of-${prompt.command.replace(/^\//, "")}`,
    title: `${prompt.title} Copy`,
    aliases: [],
    variants: [],
    versions: [
      {
        ...prompt.versions.find((version) => version.id === prompt.defaultVersionId)!,
        id: "v1",
        promptId: prompt.id,
        label: "Original",
        content,
        isDefault: true
      }
    ],
    defaultVersionId: "v1"
  };
  return serializePromptDocument(duplicate);
}

export function createLibrary(libraryPath?: string): PromptLibrary {
  return new PromptLibrary(libraryPath ? { path: libraryPath } : {});
}

export function resolvePromptToken(library: PromptLibrary, token: string): TokenResolution | undefined {
  return resolveToken(library.list(), token);
}
