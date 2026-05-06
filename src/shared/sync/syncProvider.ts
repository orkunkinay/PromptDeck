import type { PromptDeckExport } from "../models/prompt";

export interface SyncProvider {
  readonly name: string;
  push(data: PromptDeckExport): Promise<void>;
  pull(): Promise<PromptDeckExport | null>;
}

export class LocalSyncProvider implements SyncProvider {
  readonly name = "local";
  async push(): Promise<void> {
    return undefined;
  }
  async pull(): Promise<PromptDeckExport | null> {
    return null;
  }
}

export class FutureEncryptedCloudSyncProvider implements SyncProvider {
  readonly name = "future-encrypted-cloud";
  async push(): Promise<void> {
    throw new Error("Encrypted cloud sync is not implemented. PromptDeck remains fully local-first.");
  }
  async pull(): Promise<PromptDeckExport | null> {
    throw new Error("Encrypted cloud sync is not implemented. PromptDeck remains fully local-first.");
  }
}
