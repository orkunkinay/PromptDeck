/**
 * Platform-neutral PromptDeck core for non-browser surfaces (CLI, VS Code,
 * coding agents). Reuses the same prompt model, fuzzy search, versioning,
 * variant resolution, and backup logic as the browser extension, backed by a
 * local-first JSON file store instead of IndexedDB.
 */
export * from "./paths";
export * from "./fileStore";
export * from "./resolve";
export * from "./library";
export * from "./clipboard";

// Re-export the shared model and key helpers so consumers have a single entry.
export type {
  Prompt,
  PromptVersion,
  PromptVariant,
  PromptDeckSettings,
  ResolvedPromptContent
} from "../shared/models/prompt";
export { searchPrompts, type SearchResult } from "../shared/search/fuzzySearch";
export { resolvePromptContent } from "../shared/versioning/versionService";
export { compilePrompt, extractVariables } from "../shared/promptCompiler/compiler";
export {
  createBackup,
  validateBackup,
  stringifyBackup,
  backupFilename,
  type ImportMode,
  type PromptDeckBackup
} from "../shared/backup";
