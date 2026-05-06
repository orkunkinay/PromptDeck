export const PROMPTDECK_STATE_KEY = "promptdeck.state";

export type PromptDeckStateChangeReason = "prompts" | "settings" | "import" | "usage" | "seed";

export interface PromptDeckStateSignal {
  reason: PromptDeckStateChangeReason;
  changedAt: string;
  nonce: string;
}

function chromeStorageAvailable(): boolean {
  return typeof chrome !== "undefined" && Boolean(chrome.storage?.local);
}

export async function notifyPromptDeckStateChanged(reason: PromptDeckStateChangeReason): Promise<void> {
  if (!chromeStorageAvailable()) return;
  const signal: PromptDeckStateSignal = {
    reason,
    changedAt: new Date().toISOString(),
    nonce: Math.random().toString(36).slice(2)
  };
  await chrome.storage.local.set({ [PROMPTDECK_STATE_KEY]: signal });
}
