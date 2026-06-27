import {
  backupFilename,
  PromptLibrary,
  type ImportMode,
  type Prompt,
  type PromptDeckSettings
} from "../../../src/core";
import { ensureVariableDefinitions } from "../../../src/shared/promptCompiler/compiler";
import { commandToId, limitPromptTitle, nowIso, titleFromCommand } from "../../../src/shared/utils/id";

export type ManagerRequest =
  | { id: string; type: "LIBRARY_GET" }
  | { id: string; type: "SETTINGS_SAVE"; settings: Partial<PromptDeckSettings> }
  | { id: string; type: "PROMPT_CREATE" }
  | {
      id: string;
      type: "PROMPT_SAVE";
      prompt: Prompt;
      content?: string;
      minorEdit?: boolean;
      changelog?: string;
    }
  | { id: string; type: "PROMPT_DELETE"; token: string }
  | { id: string; type: "PROMPT_DUPLICATE"; token: string }
  | { id: string; type: "PROMPT_INSERT"; token: string }
  | { id: string; type: "PROMPT_COPY"; token: string }
  | { id: string; type: "BACKUP_IMPORT"; raw: unknown; mode: ImportMode }
  | { id: string; type: "BACKUP_EXPORT" }
  | { id: string; type: "LIBRARY_OPEN_FILE" };

export interface ManagerResponse {
  id: string;
  ok: boolean;
  result?: unknown;
  error?: string;
}

export interface ManagerBridgeDependencies {
  openLibrary(): PromptLibrary;
  refreshTree(): void;
  insertPrompt(token: string): Promise<void>;
  copyPrompt(token: string): Promise<void>;
  openLibraryFile(): Promise<void>;
}

function commandExists(prompts: Prompt[], command: string): boolean {
  const normalized = command.toLowerCase();
  return prompts.some((prompt) => [prompt.command, ...prompt.aliases].some((value) => value.toLowerCase() === normalized));
}

function nextCommand(prompts: Prompt[], base: string): string {
  if (!commandExists(prompts, base)) return base;
  let index = 2;
  while (commandExists(prompts, `${base}-${index}`)) index += 1;
  return `${base}-${index}`;
}

function createPromptFromCommand(command: string): Prompt {
  const now = nowIso();
  const normalizedCommand = command.startsWith("/") ? command : `/${command}`;
  const id = commandToId(normalizedCommand);
  return {
    id,
    title: titleFromCommand(normalizedCommand),
    command: normalizedCommand,
    aliases: [],
    tags: [],
    description: "",
    defaultVersionId: "v1",
    versions: [
      {
        id: "v1",
        promptId: id,
        label: "Original",
        content: "",
        changelog: "Created prompt",
        createdAt: now,
        createdBy: "local user",
        isDefault: true
      }
    ],
    variants: [],
    variables: {},
    createdAt: now,
    updatedAt: now,
    usageCount: 0
  };
}

function duplicatePrompt(library: PromptLibrary, token: string): Prompt {
  const resolution = library.resolve(token);
  if (!resolution) throw new Error(`No prompt found for "${token}".`);
  const prompts = library.list();
  const baseCommand = `/copy-of-${resolution.prompt.command.replace(/^\//, "")}`;
  const command = nextCommand(prompts, baseCommand);
  const id = commandToId(command);
  const now = nowIso();
  const content = resolution.resolved.content;
  return library.savePrompt(
    {
      ...resolution.prompt,
      id,
      command,
      title: limitPromptTitle(`${resolution.prompt.title} Copy`),
      aliases: [],
      variants: [],
      defaultVersionId: "v1",
      versions: [
        {
          id: "v1",
          promptId: id,
          label: "Original",
          content,
          changelog: "Duplicated prompt",
          createdAt: now,
          createdBy: "local user",
          isDefault: true
        }
      ],
      variables: ensureVariableDefinitions(content),
      body: content,
      createdAt: now,
      updatedAt: now,
      lastUsedAt: undefined,
      usageCount: 0,
      useCount: 0
    },
    { minorEdit: true, content }
  );
}

export async function handleManagerRequest(
  request: ManagerRequest,
  dependencies: ManagerBridgeDependencies
): Promise<unknown> {
  const library = dependencies.openLibrary();

  switch (request.type) {
    case "LIBRARY_GET": {
      const file = library.store.load();
      return { prompts: file.prompts, settings: file.settings, libraryPath: library.path };
    }
    case "SETTINGS_SAVE": {
      const settings = library.updateSettings(request.settings);
      dependencies.refreshTree();
      return settings;
    }
    case "PROMPT_CREATE": {
      const prompt = library.savePrompt(createPromptFromCommand(nextCommand(library.list(), "/new-prompt")), {
        minorEdit: true
      });
      dependencies.refreshTree();
      return prompt;
    }
    case "PROMPT_SAVE": {
      const prompt = library.savePrompt(request.prompt, {
        content: request.content,
        minorEdit: request.minorEdit,
        changelog: request.changelog
      });
      dependencies.refreshTree();
      return prompt;
    }
    case "PROMPT_DELETE": {
      const removed = library.removePrompt(request.token);
      dependencies.refreshTree();
      return removed;
    }
    case "PROMPT_DUPLICATE": {
      const prompt = duplicatePrompt(library, request.token);
      dependencies.refreshTree();
      return prompt;
    }
    case "PROMPT_INSERT":
      await dependencies.insertPrompt(request.token);
      dependencies.refreshTree();
      return undefined;
    case "PROMPT_COPY":
      await dependencies.copyPrompt(request.token);
      dependencies.refreshTree();
      return undefined;
    case "BACKUP_IMPORT": {
      const result = library.importBackup(request.raw, request.mode);
      dependencies.refreshTree();
      return result;
    }
    case "BACKUP_EXPORT":
      return { filename: backupFilename(), content: `${library.exportBackupString()}\n` };
    case "LIBRARY_OPEN_FILE":
      await dependencies.openLibraryFile();
      return undefined;
  }
}

export async function respondToManagerRequest(
  request: ManagerRequest,
  dependencies: ManagerBridgeDependencies
): Promise<ManagerResponse> {
  try {
    return { id: request.id, ok: true, result: await handleManagerRequest(request, dependencies) };
  } catch (error) {
    return { id: request.id, ok: false, error: error instanceof Error ? error.message : String(error) };
  }
}
