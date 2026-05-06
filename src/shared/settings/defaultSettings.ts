import type { PromptDeckSettings } from "../models/prompt";

export const CURRENT_SCHEMA_VERSION = 1;

export const defaultSettings: PromptDeckSettings = {
  schemaVersion: CURRENT_SCHEMA_VERSION,
  theme: "system",
  trigger: ";;",
  insertionMode: "prefer-direct",
  disabledHosts: [],
  favoritePromptIdsByHost: {},
  rememberVariableValues: true,
  telemetryEnabled: false
};
