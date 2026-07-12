import type { Prompt, PromptDeckSettings } from "../shared/models/prompt";
import { createBackup, stringifyBackup } from "../shared/backup";
import { commandToId } from "../shared/utils/id";
import { getDefaultVersion } from "../shared/versioning/versionService";

export function currentContent(prompt: Prompt): string {
  return getDefaultVersion(prompt)?.content || "";
}

export function download(filename: string, text: string): void {
  const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

export async function savePreImportSnapshot(prompts: Prompt[], settings: PromptDeckSettings): Promise<void> {
  const snapshot = stringifyBackup(createBackup(prompts, settings));
  const key = "promptdeck:last-pre-import-backup";
  if (typeof chrome !== "undefined" && chrome.storage?.local) {
    await chrome.storage.local.set({ [key]: snapshot });
    return;
  }
  localStorage.setItem(key, snapshot);
}

function commandExists(prompts: Prompt[], command: string): boolean {
  const normalized = command.toLowerCase();
  return prompts.some((prompt) => {
    const values = [prompt.command, ...prompt.aliases].map((value) => value.toLowerCase());
    return values.includes(normalized);
  });
}

function promptIdExists(prompts: Prompt[], command: string): boolean {
  const id = commandToId(command);
  return prompts.some((prompt) => prompt.id === id);
}

function blankPromptCommandAvailable(prompts: Prompt[], command: string): boolean {
  return !commandExists(prompts, command) && !promptIdExists(prompts, command);
}

export function nextBlankPromptCommand(prompts: Prompt[]): string {
  if (blankPromptCommandAvailable(prompts, "/new-prompt")) return "/new-prompt";
  let index = 2;
  while (!blankPromptCommandAvailable(prompts, `/new-prompt-${index}`)) {
    index += 1;
  }
  return `/new-prompt-${index}`;
}
