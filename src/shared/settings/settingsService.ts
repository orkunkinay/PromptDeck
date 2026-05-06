import type { PromptDeckSettings } from "../models/prompt";
import { notifyPromptDeckStateChanged } from "../state/stateInvalidation";
import { defaultSettings } from "./defaultSettings";

export const SETTINGS_KEY = "promptdeck.settings";

export interface SettingsService {
  get(): Promise<PromptDeckSettings>;
  save(settings: PromptDeckSettings): Promise<PromptDeckSettings>;
  isHostDisabled(host: string): Promise<boolean>;
}

function chromeStorageAvailable(): boolean {
  return typeof chrome !== "undefined" && Boolean(chrome.storage?.local);
}

export class BrowserSettingsService implements SettingsService {
  async get(): Promise<PromptDeckSettings> {
    if (!chromeStorageAvailable()) return defaultSettings;
    const result = await chrome.storage.local.get(SETTINGS_KEY);
    return { ...defaultSettings, ...(result[SETTINGS_KEY] || {}), telemetryEnabled: false };
  }

  async save(settings: PromptDeckSettings): Promise<PromptDeckSettings> {
    const next = { ...defaultSettings, ...settings, telemetryEnabled: false as const };
    if (chromeStorageAvailable()) {
      await chrome.storage.local.set({ [SETTINGS_KEY]: next });
      await notifyPromptDeckStateChanged("settings");
    }
    return next;
  }

  async isHostDisabled(host: string): Promise<boolean> {
    const settings = await this.get();
    return settings.disabledHosts.includes(host);
  }
}

export const settingsService = new BrowserSettingsService();
