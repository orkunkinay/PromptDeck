import type { Prompt, ResolvedPromptContent } from "../shared/models/prompt";
import { searchPrompts } from "../shared/search/fuzzySearch";
import { resolvePromptContent } from "../shared/versioning/versionService";

export interface ParsedToken {
  /** Bare command/id portion without a leading slash, e.g. `paper-reading`. */
  name: string;
  /** Optional variant or version suffix, e.g. `short` or `v2`. */
  suffix?: string;
}

/**
 * Parse a CLI/editor token of the form `name`, `name:suffix`, `/name`, or
 * `/name:suffix`. The same `:suffix` convention the browser trigger uses.
 */
export function parseToken(token: string): ParsedToken {
  const trimmed = token.trim().replace(/^\//, "");
  const colon = trimmed.indexOf(":");
  if (colon === -1) return { name: trimmed };
  const name = trimmed.slice(0, colon);
  const suffix = trimmed.slice(colon + 1);
  return { name, suffix: suffix || undefined };
}

function normalizeCommand(value: string): string {
  return value.toLowerCase().replace(/^\//, "");
}

/**
 * Find a single prompt by exact command, alias, or id, falling back to the best
 * fuzzy search match. Returns undefined when nothing matches at all.
 */
export function findPrompt(prompts: Prompt[], name: string): Prompt | undefined {
  const needle = normalizeCommand(name);
  if (!needle) return undefined;

  const exact = prompts.find((prompt) => {
    if (normalizeCommand(prompt.command) === needle) return true;
    if (prompt.id.toLowerCase() === needle) return true;
    return prompt.aliases.some((alias) => normalizeCommand(alias) === needle);
  });
  if (exact) return exact;

  const [best] = searchPrompts(prompts, name);
  return best && best.score > 0 ? best.prompt : undefined;
}

export interface TokenResolution {
  prompt: Prompt;
  resolved: ResolvedPromptContent;
}

/**
 * Resolve a `name[:suffix]` token to concrete prompt content, applying the same
 * variant/version suffix rules used by the browser extension.
 */
export function resolveToken(prompts: Prompt[], token: string): TokenResolution | undefined {
  const { name, suffix } = parseToken(token);
  const prompt = findPrompt(prompts, name);
  if (!prompt) return undefined;
  return { prompt, resolved: resolvePromptContent(prompt, suffix) };
}
