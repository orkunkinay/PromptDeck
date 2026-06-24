import * as vscode from "vscode";
import { PromptLibrary, compilePrompt, extractVariables, type ResolvedPromptContent } from "../../../src/core";
import { buildPromptPicks, type PromptPick } from "./adapter";
import type { TokenResolution } from "../../../src/core";

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

export function activate(context: vscode.ExtensionContext): void {
  context.subscriptions.push(
    vscode.commands.registerCommand("promptdeck.searchPrompt", searchPrompt),
    vscode.commands.registerCommand("promptdeck.insertPrompt", insertPrompt),
    vscode.commands.registerCommand("promptdeck.copyPrompt", copyPrompt),
    vscode.commands.registerCommand("promptdeck.importBackup", importBackup),
    vscode.commands.registerCommand("promptdeck.exportBackup", exportBackup),
    vscode.commands.registerCommand("promptdeck.openLibraryFile", openLibraryFile)
  );
}

export function deactivate(): void {
  // Nothing to clean up; the file store is stateless between commands.
}
