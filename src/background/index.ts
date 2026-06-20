import type { RuntimeMessage, RuntimeResponse } from "../shared/models/messages";
import type { Prompt, PromptDeckSettings } from "../shared/models/prompt";
import { promptRepository } from "../shared/storage/promptRepository";
import { settingsService } from "../shared/settings/settingsService";

export async function handleMessage(message: RuntimeMessage): Promise<RuntimeResponse<unknown>> {
  try {
    switch (message.type) {
      case "PROMPTS_LIST":
        return { ok: true, data: await promptRepository.list() };
      case "PROMPTS_SAVE":
        return {
          ok: true,
          data: await promptRepository.save(message.prompt, {
            minorEdit: message.minorEdit,
            changelog: message.changelog,
            content: message.content
          })
        };
      case "PROMPTS_DELETE":
        await promptRepository.delete(message.id);
        return { ok: true };
      case "PROMPTS_DUPLICATE":
        return { ok: true, data: await promptRepository.duplicate(message.id) };
      case "PROMPTS_RECORD_USAGE":
        await promptRepository.recordUsage(message.id, message.host);
        return { ok: true };
      case "PROMPTS_REPLACE_ALL":
        await promptRepository.replaceAll(message.prompts);
        return { ok: true };
      case "SETTINGS_GET":
        return { ok: true, data: await settingsService.get() };
      case "SETTINGS_SAVE":
        return { ok: true, data: await settingsService.save(message.settings) };
      case "PROMPTDECK_STATE_CHANGED":
        return { ok: true };
      case "OPEN_OPTIONS":
        await chrome.runtime.openOptionsPage();
        return { ok: true };
      default:
        return { ok: false, error: "Unknown message type." };
    }
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "Unknown error" };
  }
}

chrome.runtime.onInstalled.addListener(() => {
  void promptRepository.ensureSeeded();
});

chrome.runtime.onMessage.addListener((message: RuntimeMessage, _sender, sendResponse) => {
  void handleMessage(message).then(sendResponse);
  return true;
});

chrome.commands?.onCommand.addListener((command) => {
  if (command === "open-promptdeck") void chrome.runtime.openOptionsPage();
});

export type BackgroundPrompt = Prompt;
export type BackgroundSettings = PromptDeckSettings;
