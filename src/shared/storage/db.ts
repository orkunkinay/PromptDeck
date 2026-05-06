import Dexie, { type Table } from "dexie";
import type { Prompt } from "../models/prompt";

export interface MetaRecord {
  key: string;
  value: unknown;
}

export class PromptDeckDatabase extends Dexie {
  prompts!: Table<Prompt, string>;
  meta!: Table<MetaRecord, string>;

  constructor() {
    super("PromptDeckDB");
    this.version(1).stores({
      prompts: "id, command, *aliases, *tags, updatedAt, lastUsedAt, usageCount",
      meta: "key"
    });
  }
}

export const db = new PromptDeckDatabase();
