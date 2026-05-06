export type ISODateString = string;

export type VariableInputKind = "text" | "textarea" | "select";

export interface PromptVariableDefinition {
  name: string;
  defaultValue?: string;
  required: boolean;
  inputKind?: VariableInputKind;
  options?: string[];
  recentValues?: string[];
}

export interface PromptVersion {
  id: string;
  promptId: string;
  label: string;
  content: string;
  changelog: string;
  createdAt: ISODateString;
  createdBy: "local user";
  isDefault?: boolean;
}

export interface PromptVariant {
  id: string;
  promptId: string;
  name: string;
  suffix: string;
  content: string;
  description?: string;
  createdAt: ISODateString;
  updatedAt: ISODateString;
}

export interface SitePreference {
  host: string;
  favoritePromptIds?: string[];
  disabled?: boolean;
  insertionMode?: InsertionMode;
}

export interface HostUseStats {
  useCount: number;
  lastUsedAt?: ISODateString;
}

export type InsertionMode = "prefer-direct" | "clipboard" | "ask";

export interface Prompt {
  id: string;
  title: string;
  command: string;
  aliases: string[];
  tags: string[];
  description: string;
  body?: string;
  favorite?: boolean;
  useCount?: number;
  hostUseStats?: Record<string, HostUseStats>;
  defaultVersionId: string;
  variants: PromptVariant[];
  versions: PromptVersion[];
  variables: Record<string, PromptVariableDefinition>;
  variablePresets?: Record<string, Record<string, string>>;
  sitePreferences?: SitePreference[];
  createdAt: ISODateString;
  updatedAt: ISODateString;
  lastUsedAt?: ISODateString;
  usageCount: number;
}

export interface PromptDeckSettings {
  schemaVersion: number;
  theme: "system" | "light" | "dark";
  trigger: string;
  insertionMode: InsertionMode;
  disabledHosts: string[];
  favoritePromptIdsByHost: Record<string, string[]>;
  rememberVariableValues: boolean;
  telemetryEnabled: false;
}

export interface PromptDeckExport {
  schemaVersion: number;
  exportedAt: ISODateString;
  prompts: Prompt[];
  settings?: PromptDeckSettings;
}

export interface ResolvedPromptContent {
  prompt: Prompt;
  kind: "default" | "version" | "variant";
  suffix?: string;
  version?: PromptVersion;
  variant?: PromptVariant;
  content: string;
}
