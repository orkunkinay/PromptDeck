import type { Prompt, PromptVariant } from "../models/prompt";
import { createId, nowIso } from "../utils/id";

export function upsertVariant(prompt: Prompt, input: Omit<PromptVariant, "id" | "promptId" | "createdAt" | "updatedAt"> & { id?: string }): Prompt {
  const now = nowIso();
  const existing = input.id ? prompt.variants.find((variant) => variant.id === input.id) : undefined;
  const variant: PromptVariant = {
    id: input.id || createId("variant"),
    promptId: prompt.id,
    name: input.name,
    suffix: input.suffix.replace(/^:/, ""),
    content: input.content,
    description: input.description,
    createdAt: existing?.createdAt || now,
    updatedAt: now
  };

  return {
    ...prompt,
    variants: existing
      ? prompt.variants.map((candidate) => (candidate.id === variant.id ? variant : candidate))
      : [...prompt.variants, variant],
    updatedAt: now
  };
}

export function removeVariant(prompt: Prompt, variantId: string): Prompt {
  return { ...prompt, variants: prompt.variants.filter((variant) => variant.id !== variantId), updatedAt: nowIso() };
}
