import type { Prompt } from "../models/prompt";

export interface SearchResult {
  prompt: Prompt;
  score: number;
  reason: string;
}

function normalize(value: string): string {
  return value.toLowerCase().trim().replace(/^\//, "");
}

function fuzzyScore(haystack: string, needle: string): number {
  if (!needle) return 0;
  const h = normalize(haystack);
  const n = normalize(needle);
  if (h === n) return 80;
  if (h.startsWith(n)) return 45;
  if (h.includes(n)) return 25;

  let score = 0;
  let index = 0;
  for (const char of n) {
    const found = h.indexOf(char, index);
    if (found === -1) return 0;
    score += found === index ? 3 : 1;
    index = found + 1;
  }
  return Math.min(18, score);
}

function recencyBoost(lastUsedAt?: string): number {
  if (!lastUsedAt) return 0;
  const ageMs = Date.now() - new Date(lastUsedAt).getTime();
  if (!Number.isFinite(ageMs)) return 0;
  const days = ageMs / 86_400_000;
  if (days <= 1) return 24;
  if (days <= 7) return 16;
  if (days <= 30) return 8;
  return 3;
}

export function searchPrompts(prompts: Prompt[], query: string, host?: string): SearchResult[] {
  const normalized = normalize(query);

  return prompts
    .map((prompt): SearchResult => {
      let baseScore = 0;
      let reason = normalized ? "fuzzy" : "recent";

      if (!normalized) {
        baseScore = prompt.favorite ? 90 : 25;
      } else {
        const aliases = [prompt.command, ...prompt.aliases];
        if (aliases.some((alias) => normalize(alias) === normalized)) {
          baseScore = 500;
          reason = "exact alias";
        } else if (normalize(prompt.title).startsWith(normalized)) {
          baseScore = 400;
          reason = "title prefix";
        } else if (normalize(prompt.title).includes(normalized)) {
          baseScore = 300;
          reason = "title";
        } else if (prompt.tags.some((tag) => normalize(tag).includes(normalized))) {
          baseScore = 220;
          reason = "tag";
        } else {
          const bestFuzzy = Math.max(
            fuzzyScore(prompt.title, normalized),
            fuzzyScore(prompt.command, normalized),
            ...prompt.aliases.map((alias) => fuzzyScore(alias, normalized)),
            fuzzyScore(prompt.description, normalized)
          );
          baseScore = bestFuzzy;
          reason = "fuzzy";
        }
      }

      const hostStats = host ? prompt.hostUseStats?.[host] : undefined;
      let score = baseScore;
      if (prompt.favorite) score += 80;
      score += recencyBoost(prompt.lastUsedAt);
      score += Math.min(60, (prompt.useCount ?? prompt.usageCount ?? 0) * 3);
      if (hostStats) {
        score += Math.min(70, hostStats.useCount * 6);
        score += recencyBoost(hostStats.lastUsedAt);
      }
      if (host && prompt.sitePreferences?.some((preference) => preference.host === host && preference.favoritePromptIds?.includes(prompt.id))) {
        score += 60;
      }

      return { prompt, score, reason };
    })
    .filter((result) => result.score > 0 || !normalized)
    .sort((a, b) => b.score - a.score || a.prompt.title.localeCompare(b.prompt.title));
}
