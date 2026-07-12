import { getActiveEditable, isContentEditableElement, isTextInput, type EditableElement } from "../insertion/editable";
import type { InsertionRequest, InsertionResult } from "../insertion/insertionService";

export interface EditorAdapter {
  id: string;
  matches(element: EditableElement, host: string): boolean;
  insert(request: InsertionRequest): Promise<InsertionResult>;
}

export interface EditorInsertHandlers {
  textInput(request: InsertionRequest): InsertionResult;
  richContentEditable(request: InsertionRequest, adapterId: string): InsertionResult;
  genericContentEditable(request: InsertionRequest): InsertionResult;
}

function isElementWithClass(element: EditableElement, selector: string): boolean {
  return element instanceof Element && Boolean(element.closest(selector));
}

function hostMatches(host: string, suffixes: string[]): boolean {
  return suffixes.some((suffix) => host === suffix || host.endsWith(`.${suffix}`));
}

function contentEditableMatches(element: EditableElement, host: string, selectors: string[], hosts: string[] = []): boolean {
  if (!isContentEditableElement(element)) return false;
  return isElementWithClass(element, selectors.join(",")) || hostMatches(host, hosts);
}

export function createEditorAdapters(handlers: EditorInsertHandlers): EditorAdapter[] {
  return [
    {
      id: "codemirror",
      matches: (element) =>
        isContentEditableElement(element) &&
        isElementWithClass(element, ".cm-content,.CodeMirror,.CodeMirror-code,[data-language],[data-codemirror]"),
      insert: async (request) => handlers.richContentEditable(request, "codemirror")
    },
    {
      id: "prosemirror",
      matches: (element, host) =>
        contentEditableMatches(element, host, [".ProseMirror", "[data-node-view-wrapper]", "[data-pm-slice]"], ["chatgpt.com", "chat.openai.com"]),
      insert: async (request) => handlers.richContentEditable(request, "prosemirror")
    },
    {
      id: "lexical",
      matches: (element, host) =>
        contentEditableMatches(element, host, ["[data-lexical-editor='true']", "[data-slate-zero-width]"], ["claude.ai", "meta.ai"]),
      insert: async (request) => handlers.richContentEditable(request, "lexical")
    },
    {
      id: "slate-draft",
      matches: (element) =>
        isContentEditableElement(element) &&
        isElementWithClass(
          element,
          "[data-slate-editor='true'],[data-contents='true'],.DraftEditor-root,.DraftEditor-editorContainer,.public-DraftEditor-content"
        ),
      insert: async (request) => handlers.richContentEditable(request, "slate-draft")
    },
    {
      id: "text-input",
      matches: (element) => isTextInput(element),
      insert: async (request) => handlers.textInput(request)
    },
    {
      id: "generic-contenteditable",
      matches: (element) => isContentEditableElement(element),
      insert: async (request) => handlers.genericContentEditable(request)
    }
  ];
}

export function resolveEditorAdapter(adapters: EditorAdapter[], element: EditableElement, host = location.hostname): EditorAdapter | null {
  return adapters.find((adapter) => adapter.matches(element, host)) ?? null;
}

export function canRunPromptDeck(): boolean {
  return Boolean(getActiveEditable());
}

export function getCurrentHost(): string {
  return location.hostname;
}

export function isHostDisabled(host: string, disabledHosts: string[]): boolean {
  return disabledHosts.includes(host);
}
