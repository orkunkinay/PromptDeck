import * as vscode from "vscode";
import {
  parsePromptDocument,
  promptTemplate,
  serializePromptDocument,
  type PromptLibrary
} from "../../../src/core";
import { promptCommandFromResourceName } from "./adapter";

const encoder = new TextEncoder();
const decoder = new TextDecoder();

function resourceName(uri: vscode.Uri): string {
  return uri.path.split("/").filter(Boolean).pop() || "new.prompt.md";
}

function isNewDocument(uri: vscode.Uri): boolean {
  return new URLSearchParams(uri.query).get("new") === "1";
}

export class PromptDocumentProvider implements vscode.FileSystemProvider {
  private readonly changed = new vscode.EventEmitter<vscode.FileChangeEvent[]>();
  readonly onDidChangeFile = this.changed.event;
  private readonly seeds = new Map<string, string>();
  private readonly createdFromNewDocuments = new Map<string, string>();

  constructor(
    private readonly openLibrary: () => PromptLibrary,
    private readonly refreshTree: () => void
  ) {}

  seedDocument(uri: vscode.Uri, content: string): void {
    this.seeds.set(uri.toString(), content);
  }

  watch(): vscode.Disposable {
    return new vscode.Disposable(() => undefined);
  }

  stat(): vscode.FileStat {
    return {
      type: vscode.FileType.File,
      ctime: Date.now(),
      mtime: Date.now(),
      size: 0
    };
  }

  readDirectory(): [string, vscode.FileType][] {
    return this.openLibrary()
      .list()
      .map((prompt) => [`${prompt.command.replace(/^\//, "")}.prompt.md`, vscode.FileType.File]);
  }

  createDirectory(): void {
    throw vscode.FileSystemError.NoPermissions("PromptDeck does not support directories.");
  }

  readFile(uri: vscode.Uri): Uint8Array {
    const seeded = this.seeds.get(uri.toString());
    if (seeded !== undefined) return encoder.encode(seeded);
    if (isNewDocument(uri)) return encoder.encode(promptTemplate());

    const command = promptCommandFromResourceName(resourceName(uri));
    const prompt = this.openLibrary().resolve(command)?.prompt;
    if (!prompt) throw vscode.FileSystemError.FileNotFound(uri);
    return encoder.encode(serializePromptDocument(prompt));
  }

  writeFile(uri: vscode.Uri, content: Uint8Array): void {
    try {
      const text = decoder.decode(content);
      const parsed = parsePromptDocument(text);
      const library = this.openLibrary();
      const uriKey = uri.toString();
      const createdCommand = this.createdFromNewDocuments.get(uriKey);
      const uriCommand = createdCommand || promptCommandFromResourceName(resourceName(uri));
      const existing = library.resolve(uriCommand)?.prompt;

      if (isNewDocument(uri) && !createdCommand) {
        const prompt = library.addPrompt(parsed);
        this.createdFromNewDocuments.set(uriKey, prompt.command);
      } else if (!existing) {
        library.addPrompt(parsed);
      } else {
        if (parsed.command !== existing.command) {
          throw new Error("Changing a prompt command is not supported when editing. Create or duplicate a prompt instead.");
        }
        library.updatePrompt(existing.command, {
          title: parsed.title,
          aliases: parsed.aliases,
          tags: parsed.tags,
          description: parsed.description,
          content: parsed.content,
          minor: true
        });
      }

      this.seeds.delete(uri.toString());
      this.refreshTree();
      this.changed.fire([{ type: vscode.FileChangeType.Changed, uri }]);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      vscode.window.showErrorMessage(`PromptDeck save failed: ${message}`);
      throw error;
    }
  }

  delete(uri: vscode.Uri): void {
    const command = promptCommandFromResourceName(resourceName(uri));
    this.openLibrary().removePrompt(command);
    this.refreshTree();
    this.changed.fire([{ type: vscode.FileChangeType.Deleted, uri }]);
  }

  rename(): void {
    throw vscode.FileSystemError.NoPermissions("PromptDeck prompt documents cannot be renamed.");
  }
}
