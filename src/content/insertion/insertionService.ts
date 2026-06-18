import { getActiveEditable, isTextInput, type EditableElement } from "./editable";
import { createEditorAdapters, resolveEditorAdapter } from "../adapters/siteAdapter";

export interface InsertionRequest {
  text: string;
  replaceRange?: { start: number; end: number };
  preserveCommand?: boolean;
  target?: EditableElement;
}

export interface InsertionResult {
  mode: "direct" | "clipboard";
  ok: boolean;
  message: string;
  adapterId?: string;
}

function createTextInputEvent(type: "beforeinput" | "input", text: string, inputType = "insertText"): InputEvent {
  return new InputEvent(type, {
    bubbles: true,
    cancelable: type === "beforeinput",
    data: text,
    inputType
  });
}

function dispatchBeforeInputEvent(element: Element, text: string, inputType = "insertText"): boolean {
  return element.dispatchEvent(createTextInputEvent("beforeinput", text, inputType));
}

function dispatchInputEvents(element: Element, text = "", inputType = "insertText"): void {
  element.dispatchEvent(createTextInputEvent("input", text, inputType));
  element.dispatchEvent(new Event("change", { bubbles: true }));
}

function focusEditable(element: HTMLElement | HTMLInputElement | HTMLTextAreaElement): void {
  try {
    element.focus({ preventScroll: true });
  } catch {
    element.focus();
  }
}

function nodesForPlainText(text: string): Node[] {
  if (!text) return [];
  const parts = text.split("\n");
  const nodes: Node[] = [];
  parts.forEach((part, index) => {
    if (part) nodes.push(document.createTextNode(part));
    if (index < parts.length - 1) nodes.push(document.createElement("br"));
  });
  return nodes;
}

function moveSelectionAfter(node: Node, selection: Selection | null): void {
  if (!selection) return;
  const range = document.createRange();
  range.setStartAfter(node);
  range.collapse(true);
  selection.removeAllRanges();
  selection.addRange(range);
}

function isElementLineBreak(node: Node): boolean {
  return node instanceof HTMLBRElement;
}

function textLengthForNode(node: Node): number {
  if (node.nodeType === Node.TEXT_NODE) return node.textContent?.length ?? 0;
  if (isElementLineBreak(node)) return 1;
  return 0;
}

function boundaryForTextOffset(root: HTMLElement, offset: number): { node: Node; offset: number } | null {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT);
  let currentOffset = 0;
  let lastTextNode: Text | null = null;

  while (walker.nextNode()) {
    const node = walker.currentNode;
    if (node instanceof Text) {
      const length = textLengthForNode(node);
      if (offset <= currentOffset + length) {
        return { node, offset: Math.max(0, offset - currentOffset) };
      }
      currentOffset += length;
      lastTextNode = node;
    } else if (isElementLineBreak(node)) {
      if (offset <= currentOffset) return { node: node.parentNode ?? root, offset: 0 };
      currentOffset += 1;
    }
  }

  if (lastTextNode) return { node: lastTextNode, offset: lastTextNode.textContent?.length ?? 0 };
  return { node: root, offset: root.childNodes.length };
}

function selectTextOffsets(element: HTMLElement, start: number, end: number): boolean {
  const selection = document.getSelection();
  if (!selection) return false;
  const startBoundary = boundaryForTextOffset(element, start);
  const endBoundary = boundaryForTextOffset(element, end);
  if (!startBoundary || !endBoundary) return false;

  const range = document.createRange();
  range.setStart(startBoundary.node, startBoundary.offset);
  range.setEnd(endBoundary.node, endBoundary.offset);
  selection.removeAllRanges();
  selection.addRange(range);
  return true;
}

function readEditableText(element: HTMLElement): string {
  if (typeof element.innerText === "string") return element.innerText;
  const readNode = (node: Node): string => {
    if (node.nodeType === Node.TEXT_NODE) return node.textContent ?? "";
    if (node instanceof HTMLBRElement) return "\n";
    return Array.from(node.childNodes)
      .map((child) => readNode(child))
      .join("");
  };
  return readNode(element);
}

function readElementText(element: EditableElement): string {
  return isTextInput(element) ? element.value : readEditableText(element);
}

function normalizeEditorText(text: string): string {
  return text.replace(/\r\n?/g, "\n");
}

function expectedTextFromRequest(beforeText: string, request: InsertionRequest): string | null {
  if (request.preserveCommand) return null;
  if (!request.replaceRange) return null;
  return `${beforeText.slice(0, request.replaceRange.start)}${request.text}${beforeText.slice(request.replaceRange.end)}`;
}

function didApplyRequest(element: EditableElement, beforeText: string, request: InsertionRequest): boolean {
  const afterText = readElementText(element);
  const normalizedBefore = normalizeEditorText(beforeText);
  const normalizedAfter = normalizeEditorText(afterText);
  const expected = expectedTextFromRequest(normalizedBefore, request);
  if (expected !== null) {
    if (normalizedAfter === expected) return true;
    const replacedText = normalizeEditorText(beforeText.slice(request.replaceRange!.start, request.replaceRange!.end));
    const insertedText = normalizeEditorText(request.text);
    const insertedMatches = insertedText ? normalizedAfter.includes(insertedText) : normalizedAfter !== normalizedBefore;
    const replacedTextRemoved = replacedText ? !normalizedAfter.includes(replacedText) : true;
    return normalizedAfter !== normalizedBefore && insertedMatches && replacedTextRemoved;
  }
  if (request.text && normalizedAfter.includes(normalizeEditorText(request.text)) && normalizedAfter !== normalizedBefore) return true;
  return !request.text && normalizedAfter !== normalizedBefore;
}

function directResult(ok: boolean, adapterId: string, message: string): InsertionResult {
  return { mode: "direct", ok, message, adapterId };
}

function isInsertionDebugEnabled(): boolean {
  try {
    return localStorage.getItem("promptdeck:debugInsertion") === "true";
  } catch {
    return false;
  }
}

function debugInsertion(adapterId: string, result: InsertionResult): void {
  if (!isInsertionDebugEnabled()) return;
  console.debug("[PromptDeck] insertion", { adapterId, ok: result.ok, mode: result.mode, message: result.message });
}

function insertTextThroughEditorApi(element: HTMLElement, request: InsertionRequest, beforeText: string, adapterId: string): boolean {
  if (typeof document.execCommand !== "function") return false;
  try {
    const accepted = document.execCommand("insertText", false, request.text);
    if (!accepted) return false;
    focusEditable(element);
    dispatchInputEvents(element, request.text);
    return didApplyRequest(element, beforeText, request);
  } catch {
    if (isInsertionDebugEnabled()) {
      console.debug("[PromptDeck] insertion execCommand failed", { adapterId });
    }
    return false;
  }
}

function setTextInputValue(element: HTMLInputElement | HTMLTextAreaElement, value: string): void {
  const prototype = element instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
  const setter = Object.getOwnPropertyDescriptor(prototype, "value")?.set;
  if (setter) setter.call(element, value);
  else element.value = value;
}

function insertIntoTextInput(request: InsertionRequest): InsertionResult {
  if (!request.target || !isTextInput(request.target)) return directResult(false, "text-input", "No text input target");
  const element = request.target;
  focusEditable(element);
  const beforeText = element.value;
  const start = request.preserveCommand ? element.selectionStart ?? element.value.length : request.replaceRange?.start ?? element.selectionStart ?? element.value.length;
  const end = request.preserveCommand ? element.selectionEnd ?? element.value.length : request.replaceRange?.end ?? element.selectionEnd ?? element.value.length;
  const before = element.value.slice(0, start);
  const after = element.value.slice(end);
  const spacer = request.preserveCommand && before && !/\s$/.test(before) ? " " : "";
  const nextValue = `${before}${spacer}${request.text}${after}`;
  dispatchBeforeInputEvent(element, request.text);
  setTextInputValue(element, nextValue);
  const caret = before.length + spacer.length + request.text.length;
  element.setSelectionRange(caret, caret);
  dispatchInputEvents(element, request.text);
  return directResult(didApplyRequest(element, beforeText, request) || element.value === nextValue, "text-input", "Inserted");
}

function selectRangeForRequest(element: HTMLElement, request: InsertionRequest): boolean {
  if (!request.preserveCommand && request.replaceRange) {
    return selectTextOffsets(element, request.replaceRange.start, request.replaceRange.end);
  }
  return true;
}

function getSelectionRangeInside(element: HTMLElement): Range | null {
  const selection = document.getSelection();
  if (!selection) return null;
  if (!selection.rangeCount) {
    const range = document.createRange();
    range.selectNodeContents(element);
    range.collapse(false);
    selection.addRange(range);
    return range;
  }
  const range = selection.getRangeAt(0);
  if (!element.contains(range.startContainer)) return null;
  return range;
}

function insertIntoRichContentEditable(request: InsertionRequest, adapterId: string): InsertionResult {
  if (!(request.target instanceof HTMLElement)) return directResult(false, adapterId, "No contenteditable target");
  const element = request.target;
  focusEditable(element);
  const beforeText = readEditableText(element);
  const selectedRequestedRange = selectRangeForRequest(element, request);
  dispatchBeforeInputEvent(element, request.text);
  if (didApplyRequest(element, beforeText, request)) {
    dispatchInputEvents(element, request.text);
    return directResult(true, adapterId, "Inserted");
  }
  if (selectedRequestedRange && insertTextThroughEditorApi(element, request, beforeText, adapterId)) {
    return directResult(true, adapterId, "Inserted");
  }
  return directResult(false, adapterId, "Direct insertion failed");
}

function insertIntoGenericContentEditable(request: InsertionRequest): InsertionResult {
  if (!(request.target instanceof HTMLElement)) return directResult(false, "generic-contenteditable", "No contenteditable target");
  const element = request.target;
  focusEditable(element);
  const beforeText = readEditableText(element);
  const selectedRequestedRange = selectRangeForRequest(element, request);
  dispatchBeforeInputEvent(element, request.text);
  if (didApplyRequest(element, beforeText, request)) {
    dispatchInputEvents(element, request.text);
    return directResult(true, "generic-contenteditable", "Inserted");
  }
  if (selectedRequestedRange && insertTextThroughEditorApi(element, request, beforeText, "generic-contenteditable")) {
    return directResult(true, "generic-contenteditable", "Inserted");
  }
  const selection = document.getSelection();
  const range = getSelectionRangeInside(element);
  if (!selection || !range) return directResult(false, "generic-contenteditable", "Direct insertion failed");

  range.deleteContents();
  const nodes = nodesForPlainText(request.text);
  if (nodes.length) {
    const fragment = document.createDocumentFragment();
    nodes.forEach((node) => fragment.append(node));
    range.insertNode(fragment);
    moveSelectionAfter(nodes[nodes.length - 1], selection);
  }
  focusEditable(element);
  dispatchInputEvents(element, request.text);
  return directResult(didApplyRequest(element, beforeText, request), "generic-contenteditable", "Inserted");
}

const editorAdapters = createEditorAdapters({
  textInput: insertIntoTextInput,
  richContentEditable: insertIntoRichContentEditable,
  genericContentEditable: insertIntoGenericContentEditable
});

async function tryDirectInsertion(request: InsertionRequest): Promise<InsertionResult> {
  const element: EditableElement | null = request.target ?? getActiveEditable();
  try {
    if (!element) return directResult(false, "none", "No active editable");
    const adapter = resolveEditorAdapter(editorAdapters, element);
    if (!adapter) return directResult(false, "none", "No matching editor adapter");
    const result = await adapter.insert({ ...request, target: element });
    debugInsertion(adapter.id, result);
    return result;
  } catch (error) {
    const message = error instanceof Error ? error.message : "Direct insertion failed";
    const result = directResult(false, "unknown", message);
    debugInsertion("unknown", result);
    return result;
  }
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function plainTextToClipboardHtml(text: string): string {
  const lines = text.split("\n");
  const body = lines
    .map((line) => `<p style="margin: 0; white-space: pre-wrap;">${line ? escapeHtml(line) : "&nbsp;"}</p>`)
    .join("");
  return `<meta charset="utf-8"><!--StartFragment-->${body}<!--EndFragment-->`;
}

function copyWithClipboardEvent(text: string, html: string): boolean {
  if (typeof document.execCommand !== "function") return false;
  let copied = false;
  const textarea = document.createElement("textarea");
  const onCopy = (event: ClipboardEvent): void => {
    if (!event.clipboardData) return;
    event.preventDefault();
    event.clipboardData.setData("text/plain", text);
    event.clipboardData.setData("text/html", html);
    copied = true;
  };

  textarea.value = text;
  textarea.style.position = "fixed";
  textarea.style.left = "-9999px";
  textarea.setAttribute("readonly", "true");
  document.body.append(textarea);
  textarea.select();
  document.addEventListener("copy", onCopy, true);
  try {
    document.execCommand("copy");
  } finally {
    document.removeEventListener("copy", onCopy, true);
    textarea.remove();
  }
  return copied;
}

export async function copyToClipboard(text: string): Promise<void> {
  const normalizedText = text.replace(/\r\n?/g, "\n");
  const clipboardPlainText = normalizedText.replace(/\n/g, "\r\n");
  const html = plainTextToClipboardHtml(normalizedText);
  if (navigator.clipboard?.write && typeof ClipboardItem !== "undefined") {
    try {
      await navigator.clipboard.write([
        new ClipboardItem({
          "text/plain": new Blob([clipboardPlainText], { type: "text/plain" }),
          "text/html": new Blob([html], { type: "text/html" })
        })
      ]);
      return;
    } catch {
      // Some pages/browsers expose structured clipboard APIs but block them.
    }
  }

  if (copyWithClipboardEvent(clipboardPlainText, html)) return;

  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(clipboardPlainText);
    return;
  }
  const textarea = document.createElement("textarea");
  textarea.value = clipboardPlainText;
  textarea.style.position = "fixed";
  textarea.style.left = "-9999px";
  document.body.append(textarea);
  textarea.select();
  document.execCommand("copy");
  textarea.remove();
}

export async function insertOrCopy(request: InsertionRequest, preferClipboard = false): Promise<InsertionResult> {
  const modifier = navigator.platform.toLowerCase().includes("mac") ? "Cmd+V" : "Ctrl+V";
  if (preferClipboard) {
    await copyToClipboard(request.text);
    if (request.replaceRange && !request.preserveCommand) {
      await tryDirectInsertion({ ...request, text: "" });
    }
    return { mode: "clipboard", ok: true, message: `Copied — press ${modifier}` };
  }

  const inserted = await tryDirectInsertion(request);
  if (inserted.ok) return inserted;

  await copyToClipboard(request.text);
  return { mode: "clipboard", ok: true, message: `Copied — press ${modifier}` };
}
