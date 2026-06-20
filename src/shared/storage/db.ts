import Dexie, { type Table } from "dexie";
import type { Prompt } from "../models/prompt";

export type StoredPrompt = Prompt & {
  commandTokens?: string[];
};

export interface MetaRecord {
  key: string;
  value: unknown;
}

export class PromptDeckDatabase extends Dexie {
  prompts!: Table<StoredPrompt, string>;
  meta!: Table<MetaRecord, string>;

  constructor() {
    super("PromptDeckDB");
    this.version(1).stores({
      prompts: "id, command, *aliases, *tags, updatedAt, lastUsedAt, usageCount",
      meta: "key"
    });
    this.version(2)
      .stores({
        prompts: "id, command, *aliases, *commandTokens, *tags, updatedAt, lastUsedAt, usageCount",
        meta: "key"
      })
      .upgrade(async (transaction) => {
        await transaction
          .table<StoredPrompt, string>("prompts")
          .toCollection()
          .modify((prompt) => {
            prompt.commandTokens = [prompt.command, ...(prompt.aliases || [])].map((value) => value.toLowerCase());
          });
      });
  }
}

export const db = new PromptDeckDatabase();
