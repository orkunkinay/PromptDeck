import type { Prompt } from "../../../src/core";
import { PromptLibrary, resolveToken, type TokenResolution } from "../../../src/core";

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

export function createLibrary(libraryPath?: string): PromptLibrary {
  return new PromptLibrary(libraryPath ? { path: libraryPath } : {});
}

export function resolvePromptToken(library: PromptLibrary, token: string): TokenResolution | undefined {
  return resolveToken(library.list(), token);
}
