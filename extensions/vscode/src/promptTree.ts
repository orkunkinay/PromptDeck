import * as vscode from "vscode";
import type { PromptLibrary } from "../../../src/core";
import { buildPromptTree, type PromptTreeNodeData } from "./adapter";

export class PromptTreeItem extends vscode.TreeItem {
  constructor(readonly data: PromptTreeNodeData) {
    super(data.label, data.children.length ? vscode.TreeItemCollapsibleState.Collapsed : vscode.TreeItemCollapsibleState.None);
    this.id = data.id;
    this.description = data.description;
    this.contextValue = data.kind;
    this.tooltip = data.description ? `${data.label} - ${data.description}` : data.label;
    this.command =
      data.kind === "prompt"
        ? {
            command: "promptdeck.editPrompt",
            title: "Edit Prompt",
            arguments: [this]
          }
        : undefined;
  }
}

export class PromptTreeDataProvider implements vscode.TreeDataProvider<PromptTreeItem> {
  private readonly changed = new vscode.EventEmitter<PromptTreeItem | undefined>();
  readonly onDidChangeTreeData = this.changed.event;

  constructor(private readonly openLibrary: () => PromptLibrary) {}

  refresh(): void {
    this.changed.fire(undefined);
  }

  getTreeItem(element: PromptTreeItem): vscode.TreeItem {
    return element;
  }

  getChildren(element?: PromptTreeItem): PromptTreeItem[] {
    if (element) return element.data.children.map((child) => new PromptTreeItem(child));
    return buildPromptTree(this.openLibrary().list()).map((node) => new PromptTreeItem(node));
  }
}
