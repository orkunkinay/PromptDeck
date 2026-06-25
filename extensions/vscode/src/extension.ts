import * as vscode from "vscode";
import { PromptLibrary, compilePrompt, extractVariables, promptTemplate, type ResolvedPromptContent } from "../../../src/core";
import {
  buildPromptPicks,
  duplicatePromptDocument,
  promptResourceName,
  type PromptPick
} from "./adapter";
import type { TokenResolution } from "../../../src/core";
import { PromptDocumentProvider } from "./promptDocumentProvider";
import { PromptTreeDataProvider, type PromptTreeItem } from "./promptTree";

function libraryPathFromConfig(): string | undefined {
  const configured = vscode.workspace.getConfiguration("promptdeck").get<string>("libraryPath");
  return configured && configured.trim() ? configured.trim() : undefined;
}

function openLibrary(): PromptLibrary {
  const libraryPath = libraryPathFromConfig();
  return new PromptLibrary(libraryPath ? { path: libraryPath } : {});
}

/**
 * Resolve a token to final content, prompting the user for each `{{placeholder}}`
 * via input boxes. Returns undefined if the user cancels an input. Prompts with
 * no placeholders return their content unchanged.
 */
async function materializeContent(resolution: TokenResolution): Promise<string | undefined> {
  const resolved: ResolvedPromptContent = resolution.resolved;
  const names = extractVariables(resolved.content);
  if (names.length === 0) return resolved.content;

  const values: Record<string, string> = {};
  for (const name of names) {
    const definition = resolution.prompt.variables[name];
    const input = await vscode.window.showInputBox({
      title: `${resolution.prompt.title} — ${name}`,
      prompt: `Value for {{${name}}}${definition?.required === false ? " (optional)" : ""}`,
      value: definition?.defaultValue ?? "",
      ignoreFocusOut: true
    });
    if (input === undefined) return undefined; // cancelled
    values[name] = input;
  }
  return compilePrompt({ content: resolved.content, values, definitions: resolution.prompt.variables }).compiled;
}

async function pickPrompt(library: PromptLibrary, placeHolder: string): Promise<PromptPick | undefined> {
  const items = buildPromptPicks(library.list());
  if (items.length === 0) {
    vscode.window.showInformationMessage("PromptDeck library is empty. Import a backup to get started.");
    return undefined;
  }
  return vscode.window.showQuickPick(
    items.map((item) => ({ ...item, alwaysShow: false })),
    { placeHolder, matchOnDescription: true, matchOnDetail: true }
  );
}

async function pickPromptCommand(library: PromptLibrary, placeHolder: string): Promise<string | undefined> {
  const prompts = library.list();
  if (prompts.length === 0) {
    vscode.window.showInformationMessage("PromptDeck library is empty.");
    return undefined;
  }
  const picked = await vscode.window.showQuickPick(
    prompts.map((prompt) => ({
      label: prompt.command,
      description: prompt.title,
      detail: prompt.description || undefined
    })),
    { placeHolder, matchOnDescription: true, matchOnDetail: true }
  );
  return picked?.label;
}

function commandFromTreeArg(item: unknown): string | undefined {
  const data = (item as PromptTreeItem | undefined)?.data;
  return data?.promptCommand;
}

function tokenFromTreeArg(item: unknown): string | undefined {
  const data = (item as PromptTreeItem | undefined)?.data;
  return data?.token;
}

function promptUri(command: string): vscode.Uri {
  return vscode.Uri.parse(`promptdeck:/${promptResourceName(command)}`);
}

async function insertPrompt(): Promise<void> {
  const library = openLibrary();
  const picked = await pickPrompt(library, "Insert a prompt at the cursor");
  if (!picked) return;
  const resolution = library.resolve(picked.token);
  if (!resolution) {
    vscode.window.showErrorMessage(`PromptDeck could not resolve "${picked.token}".`);
    return;
  }
  const content = await materializeContent(resolution);
  if (content === undefined) return;
  const editor = vscode.window.activeTextEditor;
  if (!editor) {
    await vscode.env.clipboard.writeText(content);
    vscode.window.showInformationMessage("No active editor — prompt copied to the clipboard instead.");
    return;
  }
  await editor.edit((builder) => {
    for (const selection of editor.selections) {
      if (selection.isEmpty) {
        builder.insert(selection.active, content);
      } else {
        builder.replace(selection, content);
      }
    }
  });
  library.recordUsage(resolution.prompt.id);
}

async function copyPrompt(): Promise<void> {
  const library = openLibrary();
  const picked = await pickPrompt(library, "Copy a prompt to the clipboard");
  if (!picked) return;
  const resolution = library.resolve(picked.token);
  if (!resolution) {
    vscode.window.showErrorMessage(`PromptDeck could not resolve "${picked.token}".`);
    return;
  }
  const content = await materializeContent(resolution);
  if (content === undefined) return;
  await vscode.env.clipboard.writeText(content);
  library.recordUsage(resolution.prompt.id);
  vscode.window.showInformationMessage(`Copied ${picked.label} to the clipboard.`);
}

async function searchPrompt(): Promise<void> {
  const library = openLibrary();
  const picked = await pickPrompt(library, "Search prompts — choose an action next");
  if (!picked) return;
  const action = await vscode.window.showQuickPick(["Insert at cursor", "Copy to clipboard", "Show content"], {
    placeHolder: picked.label
  });
  if (!action) return;
  const resolution = library.resolve(picked.token);
  if (!resolution) {
    vscode.window.showErrorMessage(`PromptDeck could not resolve "${picked.token}".`);
    return;
  }
  if (action === "Show content") {
    // Show the raw template (with placeholders intact) for inspection.
    const doc = await vscode.workspace.openTextDocument({ content: resolution.resolved.content, language: "markdown" });
    await vscode.window.showTextDocument(doc, { preview: true });
    return;
  }
  const content = await materializeContent(resolution);
  if (content === undefined) return;
  if (action === "Copy to clipboard") {
    await vscode.env.clipboard.writeText(content);
    library.recordUsage(resolution.prompt.id);
    vscode.window.showInformationMessage(`Copied ${picked.label} to the clipboard.`);
    return;
  }
  const editor = vscode.window.activeTextEditor;
  if (!editor) {
    await vscode.env.clipboard.writeText(content);
    vscode.window.showInformationMessage("No active editor — prompt copied to the clipboard instead.");
    return;
  }
  await editor.edit((builder) => {
    for (const selection of editor.selections) {
      if (selection.isEmpty) builder.insert(selection.active, content);
      else builder.replace(selection, content);
    }
  });
  library.recordUsage(resolution.prompt.id);
}

async function importBackup(): Promise<void> {
  const fs = await import("node:fs");
  const uris = await vscode.window.showOpenDialog({
    canSelectMany: false,
    filters: { "PromptDeck backup": ["json"] },
    openLabel: "Import"
  });
  if (!uris || uris.length === 0) return;
  const mode = await vscode.window.showQuickPick(["merge-safe", "merge-update", "replace"], {
    placeHolder: "Import strategy"
  });
  if (!mode) return;
  try {
    const raw = JSON.parse(fs.readFileSync(uris[0].fsPath, "utf8"));
    const result = openLibrary().importBackup(raw, mode as "merge-safe" | "merge-update" | "replace");
    vscode.window.showInformationMessage(
      `PromptDeck import (${mode}): ${result.importedPromptCount} added, ${result.mergedPromptCount} merged, ` +
        `${result.replacedPromptCount} replaced, ${result.skippedConflictCount} skipped.`
    );
  } catch (error) {
    vscode.window.showErrorMessage(`PromptDeck import failed: ${error instanceof Error ? error.message : String(error)}`);
  }
}

async function exportBackup(): Promise<void> {
  const fs = await import("node:fs");
  const target = await vscode.window.showSaveDialog({
    filters: { "PromptDeck backup": ["json"] },
    saveLabel: "Export"
  });
  if (!target) return;
  try {
    fs.writeFileSync(target.fsPath, `${openLibrary().exportBackupString()}\n`, "utf8");
    vscode.window.showInformationMessage(`PromptDeck backup exported to ${target.fsPath}.`);
  } catch (error) {
    vscode.window.showErrorMessage(`PromptDeck export failed: ${error instanceof Error ? error.message : String(error)}`);
  }
}

async function openLibraryFile(): Promise<void> {
  const library = openLibrary();
  // Ensure the file exists before opening.
  library.list();
  const doc = await vscode.workspace.openTextDocument(vscode.Uri.file(library.path));
  await vscode.window.showTextDocument(doc);
}

async function newPrompt(provider: PromptDocumentProvider): Promise<void> {
  const uri = vscode.Uri.parse(`promptdeck:/new-${Date.now()}.prompt.md?new=1`);
  provider.seedDocument(uri, promptTemplate());
  const doc = await vscode.workspace.openTextDocument(uri);
  await vscode.window.showTextDocument(doc);
}

async function editPrompt(item?: PromptTreeItem): Promise<void> {
  const library = openLibrary();
  const command = commandFromTreeArg(item) || (await pickPromptCommand(library, "Edit a prompt"));
  if (!command) return;
  try {
    const doc = await vscode.workspace.openTextDocument(promptUri(command));
    await vscode.window.showTextDocument(doc);
  } catch (error) {
    vscode.window.showErrorMessage(`PromptDeck edit failed: ${error instanceof Error ? error.message : String(error)}`);
  }
}

async function duplicatePrompt(provider: PromptDocumentProvider, item?: PromptTreeItem): Promise<void> {
  const library = openLibrary();
  const token = tokenFromTreeArg(item) || (await pickPromptCommand(library, "Duplicate a prompt"));
  if (!token) return;
  const resolution = library.resolve(token);
  if (!resolution) {
    vscode.window.showErrorMessage(`PromptDeck could not resolve "${token}".`);
    return;
  }
  const uri = vscode.Uri.parse(`promptdeck:/duplicate-${Date.now()}.prompt.md?new=1`);
  provider.seedDocument(uri, duplicatePromptDocument(resolution.prompt, resolution.resolved.content));
  const doc = await vscode.workspace.openTextDocument(uri);
  await vscode.window.showTextDocument(doc);
}

async function deletePrompt(treeProvider: PromptTreeDataProvider, item?: PromptTreeItem): Promise<void> {
  const library = openLibrary();
  const command = commandFromTreeArg(item) || (await pickPromptCommand(library, "Delete a prompt"));
  if (!command) return;
  const prompt = library.resolve(command)?.prompt;
  if (!prompt) {
    vscode.window.showErrorMessage(`PromptDeck could not resolve "${command}".`);
    return;
  }
  const confirmed = await vscode.window.showWarningMessage(`Delete ${prompt.command}?`, { modal: true }, "Delete");
  if (confirmed !== "Delete") return;
  try {
    library.removePrompt(prompt.command);
    treeProvider.refresh();
    vscode.window.showInformationMessage(`Deleted ${prompt.command}.`);
  } catch (error) {
    vscode.window.showErrorMessage(`PromptDeck delete failed: ${error instanceof Error ? error.message : String(error)}`);
  }
}

export function activate(context: vscode.ExtensionContext): void {
  const treeProvider = new PromptTreeDataProvider(openLibrary);
  const documentProvider = new PromptDocumentProvider(openLibrary, () => treeProvider.refresh());
  context.subscriptions.push(
    vscode.workspace.registerFileSystemProvider("promptdeck", documentProvider, { isCaseSensitive: true }),
    vscode.window.registerTreeDataProvider("promptdeck.prompts", treeProvider)
  );

  context.subscriptions.push(
    vscode.commands.registerCommand("promptdeck.searchPrompt", searchPrompt),
    vscode.commands.registerCommand("promptdeck.insertPrompt", insertPrompt),
    vscode.commands.registerCommand("promptdeck.copyPrompt", copyPrompt),
    vscode.commands.registerCommand("promptdeck.newPrompt", () => newPrompt(documentProvider)),
    vscode.commands.registerCommand("promptdeck.editPrompt", (item?: PromptTreeItem) => editPrompt(item)),
    vscode.commands.registerCommand("promptdeck.duplicatePrompt", (item?: PromptTreeItem) => duplicatePrompt(documentProvider, item)),
    vscode.commands.registerCommand("promptdeck.deletePrompt", (item?: PromptTreeItem) => deletePrompt(treeProvider, item)),
    vscode.commands.registerCommand("promptdeck.importBackup", importBackup),
    vscode.commands.registerCommand("promptdeck.exportBackup", exportBackup),
    vscode.commands.registerCommand("promptdeck.openLibraryFile", openLibraryFile)
  );
}

export function deactivate(): void {
  // Nothing to clean up; the file store is stateless between commands.
}
