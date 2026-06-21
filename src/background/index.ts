import type { RuntimeMessage, RuntimeResponse } from "../shared/models/messages";
import type { InsertionMode, Prompt, PromptDeckSettings } from "../shared/models/prompt";
import { promptRepository } from "../shared/storage/promptRepository";
import { settingsService } from "../shared/settings/settingsService";

type ValidationResult = { ok: true; message: RuntimeMessage } | { ok: false; error: string };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isString(value: unknown): value is string {
  return typeof value === "string";
}

function isOptionalString(value: unknown): boolean {
  return value === undefined || isString(value);
}

function isBoolean(value: unknown): value is boolean {
  return typeof value === "boolean";
}

function isOptionalBoolean(value: unknown): boolean {
  return value === undefined || isBoolean(value);
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every(isString);
}

function isStringArrayRecord(value: unknown): value is Record<string, string[]> {
  return isRecord(value) && Object.values(value).every(isStringArray);
}

function isInsertionMode(value: unknown): value is InsertionMode {
  return value === "prefer-direct" || value === "clipboard" || value === "ask";
}

function isVariableInputKind(value: unknown): boolean {
  return value === undefined || value === "text" || value === "textarea" || value === "select";
}

function isPromptVersion(value: unknown): boolean {
  return (
    isRecord(value) &&
    isString(value.id) &&
    isString(value.promptId) &&
    isString(value.label) &&
    isString(value.content) &&
    isString(value.changelog) &&
    isString(value.createdAt) &&
    value.createdBy === "local user" &&
    isOptionalBoolean(value.isDefault)
  );
}

function isPromptVariant(value: unknown): boolean {
  return (
    isRecord(value) &&
    isString(value.id) &&
    isString(value.promptId) &&
    isString(value.name) &&
    isString(value.suffix) &&
    isString(value.content) &&
    isOptionalString(value.description) &&
    isString(value.createdAt) &&
    isString(value.updatedAt)
  );
}

function isPromptVariableDefinition(value: unknown): boolean {
  return (
    isRecord(value) &&
    isString(value.name) &&
    isOptionalString(value.defaultValue) &&
    isBoolean(value.required) &&
    isVariableInputKind(value.inputKind) &&
    (value.options === undefined || isStringArray(value.options)) &&
    (value.recentValues === undefined || isStringArray(value.recentValues))
  );
}

function isPromptVariables(value: unknown): value is Prompt["variables"] {
  return isRecord(value) && Object.values(value).every(isPromptVariableDefinition);
}

function isVariablePresets(value: unknown): boolean {
  return value === undefined || (isRecord(value) && Object.values(value).every((preset) => isRecord(preset) && Object.values(preset).every(isString)));
}

function isHostUseStats(value: unknown): boolean {
  return isRecord(value) && isFiniteNumber(value.useCount) && isOptionalString(value.lastUsedAt);
}

function isHostUseStatsRecord(value: unknown): boolean {
  return value === undefined || (isRecord(value) && Object.values(value).every(isHostUseStats));
}

function isSitePreference(value: unknown): boolean {
  return (
    isRecord(value) &&
    isString(value.host) &&
    (value.favoritePromptIds === undefined || isStringArray(value.favoritePromptIds)) &&
    isOptionalBoolean(value.disabled) &&
    (value.insertionMode === undefined || isInsertionMode(value.insertionMode))
  );
}

function isPrompt(value: unknown): value is Prompt {
  return (
    isRecord(value) &&
    isString(value.id) &&
    isString(value.title) &&
    isString(value.command) &&
    isStringArray(value.aliases) &&
    isStringArray(value.tags) &&
    isString(value.description) &&
    isOptionalString(value.body) &&
    isOptionalBoolean(value.favorite) &&
    (value.useCount === undefined || isFiniteNumber(value.useCount)) &&
    isHostUseStatsRecord(value.hostUseStats) &&
    isString(value.defaultVersionId) &&
    Array.isArray(value.variants) &&
    value.variants.every(isPromptVariant) &&
    Array.isArray(value.versions) &&
    value.versions.length > 0 &&
    value.versions.every(isPromptVersion) &&
    isPromptVariables(value.variables) &&
    isVariablePresets(value.variablePresets) &&
    (value.sitePreferences === undefined || (Array.isArray(value.sitePreferences) && value.sitePreferences.every(isSitePreference))) &&
    isString(value.createdAt) &&
    isString(value.updatedAt) &&
    isOptionalString(value.lastUsedAt) &&
    isFiniteNumber(value.usageCount)
  );
}

function isSettings(value: unknown): value is PromptDeckSettings {
  return (
    isRecord(value) &&
    isFiniteNumber(value.schemaVersion) &&
    (value.theme === "system" || value.theme === "light" || value.theme === "dark") &&
    isString(value.trigger) &&
    isInsertionMode(value.insertionMode) &&
    isStringArray(value.disabledHosts) &&
    isStringArrayRecord(value.favoritePromptIdsByHost) &&
    isBoolean(value.rememberVariableValues) &&
    value.telemetryEnabled === false
  );
}

function validateRuntimeMessage(message: unknown): ValidationResult {
  if (!isRecord(message) || !isString(message.type)) return { ok: false, error: "Invalid runtime message." };

  switch (message.type) {
    case "PROMPTS_LIST":
    case "SETTINGS_GET":
    case "OPEN_OPTIONS":
      return { ok: true, message: { type: message.type } };
    case "PROMPTS_SAVE":
      if (!isPrompt(message.prompt)) return { ok: false, error: "Invalid PROMPTS_SAVE message: prompt must be a valid prompt." };
      if (!isOptionalBoolean(message.minorEdit)) return { ok: false, error: "Invalid PROMPTS_SAVE message: minorEdit must be a boolean." };
      if (!isOptionalString(message.changelog)) return { ok: false, error: "Invalid PROMPTS_SAVE message: changelog must be a string." };
      if (!isOptionalString(message.content)) return { ok: false, error: "Invalid PROMPTS_SAVE message: content must be a string." };
      return {
        ok: true,
        message: {
          type: "PROMPTS_SAVE",
          prompt: message.prompt,
          minorEdit: message.minorEdit as boolean | undefined,
          changelog: message.changelog as string | undefined,
          content: message.content as string | undefined
        }
      };
    case "PROMPTS_DELETE":
    case "PROMPTS_DUPLICATE":
      if (!isString(message.id)) return { ok: false, error: `Invalid ${message.type} message: id must be a string.` };
      return { ok: true, message: { type: message.type, id: message.id } };
    case "PROMPTS_RECORD_USAGE":
      if (!isString(message.id)) return { ok: false, error: "Invalid PROMPTS_RECORD_USAGE message: id must be a string." };
      if (!isOptionalString(message.host)) return { ok: false, error: "Invalid PROMPTS_RECORD_USAGE message: host must be a string." };
      return { ok: true, message: { type: "PROMPTS_RECORD_USAGE", id: message.id, host: message.host as string | undefined } };
    case "PROMPTS_REPLACE_ALL":
      if (!Array.isArray(message.prompts) || !message.prompts.every(isPrompt)) {
        return { ok: false, error: "Invalid PROMPTS_REPLACE_ALL message: prompts must be valid prompts." };
      }
      return { ok: true, message: { type: "PROMPTS_REPLACE_ALL", prompts: message.prompts } };
    case "SETTINGS_SAVE":
      if (!isSettings(message.settings)) return { ok: false, error: "Invalid SETTINGS_SAVE message: settings must be valid settings." };
      return { ok: true, message: { type: "SETTINGS_SAVE", settings: message.settings } };
    default:
      return { ok: false, error: "Unknown message type." };
  }
}

export async function handleMessage(rawMessage: unknown): Promise<RuntimeResponse<unknown>> {
  const validation = validateRuntimeMessage(rawMessage);
  if (!validation.ok) return { ok: false, error: validation.error };

  const message = validation.message;
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

chrome.runtime.onMessage.addListener((message: unknown, _sender, sendResponse) => {
  void handleMessage(message).then(sendResponse);
  return true;
});

chrome.commands?.onCommand.addListener((command) => {
  if (command === "open-promptdeck") void chrome.runtime.openOptionsPage();
});

export type BackgroundPrompt = Prompt;
export type BackgroundSettings = PromptDeckSettings;
