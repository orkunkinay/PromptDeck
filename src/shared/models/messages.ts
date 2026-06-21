import type { Prompt, PromptDeckSettings } from "./prompt";

export type RuntimeMessage =
  | { type: "PROMPTS_LIST" }
  | { type: "PROMPTS_SAVE"; prompt: Prompt; minorEdit?: boolean; changelog?: string; content?: string }
  | { type: "PROMPTS_DELETE"; id: string }
  | { type: "PROMPTS_DUPLICATE"; id: string }
  | { type: "PROMPTS_RECORD_USAGE"; id: string; host?: string }
  | { type: "PROMPTS_REPLACE_ALL"; prompts: Prompt[] }
  | { type: "SETTINGS_GET" }
  | { type: "SETTINGS_SAVE"; settings: PromptDeckSettings }
  // State refreshes intentionally use chrome.storage.onChanged via notifyPromptDeckStateChanged.
  | { type: "OPEN_OPTIONS" };

export interface RuntimeResponse<T> {
  ok: boolean;
  data?: T;
  error?: string;
}
