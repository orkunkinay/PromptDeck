import type { Prompt } from "../models/prompt";
import { ensureVariableDefinitions } from "../promptCompiler/compiler";
import { seedPrompts } from "../seedPrompts";
import { notifyPromptDeckStateChanged } from "../state/stateInvalidation";
import { createVersion } from "../versioning/versionService";
import { db } from "./db";
import { limitPromptTitle, nowIso, titleFromCommand } from "../utils/id";

export interface PromptRepository {
  list(): Promise<Prompt[]>;
  get(id: string): Promise<Prompt | undefined>;
  save(prompt: Prompt, options?: { minorEdit?: boolean; changelog?: string; content?: string }): Promise<Prompt>;
  delete(id: string): Promise<void>;
  duplicate(id: string): Promise<Prompt>;
  recordUsage(id: string, host?: string): Promise<void>;
  replaceAll(prompts: Prompt[]): Promise<void>;
  ensureSeeded(): Promise<void>;
}

function normalizePrompt(prompt: Prompt): Prompt {
    const defaultVersion = prompt.versions.find((version) => version.id === prompt.defaultVersionId) || prompt.versions[0];
  return {
    ...prompt,
    title: limitPromptTitle(prompt.title),
    command: prompt.command.startsWith("/") ? prompt.command : `/${prompt.command}`,
    aliases: (prompt.aliases || []).map((alias) => (alias.startsWith("/") ? alias : `/${alias}`)),
    tags: prompt.tags || [],
    variants: prompt.variants || [],
    versions: prompt.versions || [],
    defaultVersionId: defaultVersion?.id || prompt.defaultVersionId || "v1",
    body: prompt.body || defaultVersion?.content || "",
    variables: ensureVariableDefinitions(defaultVersion?.content || "", prompt.variables || {}),
    updatedAt: prompt.updatedAt || nowIso(),
    createdAt: prompt.createdAt || nowIso(),
    usageCount: prompt.usageCount || 0
  };
}

function normalizedCommandSet(prompt: Prompt): Set<string> {
  return new Set([prompt.command, ...prompt.aliases].map((value) => value.toLowerCase()));
}

export class DexiePromptRepository implements PromptRepository {
  async list(): Promise<Prompt[]> {
    await this.ensureSeeded();
    return db.prompts.orderBy("updatedAt").reverse().toArray();
  }

  async get(id: string): Promise<Prompt | undefined> {
    await this.ensureSeeded();
    return db.prompts.get(id);
  }

  async save(prompt: Prompt, options: { minorEdit?: boolean; changelog?: string; content?: string } = {}): Promise<Prompt> {
    const existing = await db.prompts.get(prompt.id);
    let next = normalizePrompt({ ...prompt, updatedAt: nowIso() });

    const content = options.content;
    if (existing && !options.minorEdit && content !== undefined) {
      next = createVersion(next, content, options.changelog || "Saved edit");
      next.variables = ensureVariableDefinitions(content, next.variables);
    } else if (content !== undefined) {
      next.versions = next.versions.map((version) =>
        version.id === next.defaultVersionId ? { ...version, content, changelog: options.changelog || version.changelog } : version
      );
      next.variables = ensureVariableDefinitions(content, next.variables);
    }

    const nextCommands = normalizedCommandSet(next);
    const allPrompts = await db.prompts.toArray();
    const conflict = allPrompts.find((candidate) => {
      if (candidate.id === next.id) return false;
      const candidateCommands = normalizedCommandSet(candidate);
      return [...nextCommands].some((command) => candidateCommands.has(command));
    });
    if (conflict) {
      throw new Error(`Command collision with "${conflict.title}". Choose a different command or alias.`);
    }

    await db.prompts.put(next);
    await notifyPromptDeckStateChanged("prompts");
    return next;
  }

  async delete(id: string): Promise<void> {
    await db.prompts.delete(id);
    await notifyPromptDeckStateChanged("prompts");
  }

  async duplicate(id: string): Promise<Prompt> {
    const prompt = await db.prompts.get(id);
    if (!prompt) throw new Error("Prompt was not found.");
    const now = nowIso();
    const copyId = `${prompt.id}-copy-${Date.now().toString(36)}`;
    const copy: Prompt = {
      ...prompt,
      id: copyId,
      title: limitPromptTitle(`${prompt.title} Copy`),
      command: `/${prompt.command.replace(/^\//, "")}-copy`,
      aliases: [],
      createdAt: now,
      updatedAt: now,
      lastUsedAt: undefined,
      usageCount: 0,
      versions: prompt.versions.map((version) => ({ ...version, promptId: copyId })),
      variants: prompt.variants.map((variant) => ({ ...variant, promptId: copyId }))
    };
    await db.prompts.put(copy);
    await notifyPromptDeckStateChanged("prompts");
    return copy;
  }

  async recordUsage(id: string, host?: string): Promise<void> {
    const prompt = await db.prompts.get(id);
    if (!prompt) return;
    const now = nowIso();
    const hostUseStats = { ...(prompt.hostUseStats || {}) };
    if (host) {
      const current = hostUseStats[host] || { useCount: 0 };
      hostUseStats[host] = {
        useCount: current.useCount + 1,
        lastUsedAt: now
      };
    }
    await db.prompts.put({
      ...prompt,
      usageCount: (prompt.usageCount || 0) + 1,
      useCount: (prompt.useCount || prompt.usageCount || 0) + 1,
      lastUsedAt: now,
      hostUseStats
    });
    await notifyPromptDeckStateChanged("usage");
  }

  async replaceAll(prompts: Prompt[]): Promise<void> {
    await db.transaction("rw", db.prompts, async () => {
      await db.prompts.clear();
      await db.prompts.bulkPut(prompts.map(normalizePrompt));
    });
    await notifyPromptDeckStateChanged("import");
  }

  async ensureSeeded(): Promise<void> {
    const seeded = await db.meta.get("seeded");
    if (seeded?.value) return;
    const count = await db.prompts.count();
    if (count === 0) {
      await db.prompts.bulkPut(seedPrompts);
      await notifyPromptDeckStateChanged("seed");
    }
    await db.meta.put({ key: "seeded", value: true });
  }
}

export function createPromptFromCommand(command: string): Prompt {
  const now = nowIso();
  const normalizedCommand = command.startsWith("/") ? command : `/${command}`;
  const id = normalizedCommand.replace(/^\//, "").toLowerCase();
  return {
    id,
    title: titleFromCommand(normalizedCommand),
    command: normalizedCommand,
    aliases: [],
    tags: [],
    description: "",
    defaultVersionId: "v1",
    versions: [
      {
        id: "v1",
        promptId: id,
        label: "Original",
        content: "",
        changelog: "Created prompt",
        createdAt: now,
        createdBy: "local user",
        isDefault: true
      }
    ],
    variants: [],
    variables: {},
    createdAt: now,
    updatedAt: now,
    usageCount: 0
  };
}

export const promptRepository = new DexiePromptRepository();
