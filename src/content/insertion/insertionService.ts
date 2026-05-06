import { getActiveEditable, isTextInput, type EditableElement } from "./editable";

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
}

function createTextInputEvent(type: "beforeinput" | "input", text: string): InputEvent {
  return new InputEvent(type, {
    bubbles: true,
    cancelable: type === "beforeinput",
    data: text,
    inputType: "insertText"
  });
}

function dispatchBeforeInputEvent(element: Element, text: string): boolean {
  return element.dispatchEvent(createTextInputEvent("beforeinput", text));
}

function dispatchInputEvents(element: Element, text = ""): void {
  element.dispatchEvent(createTextInputEvent("input", text));
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
  return element.innerText || element.textContent || "";
}

function insertTextThroughEditorApi(element: HTMLElement, text: string): boolean {
  if (typeof document.execCommand !== "function") return false;
  const beforeText = readEditableText(element);
  try {
    const accepted = document.execCommand("insertText", false, text);
    if (!accepted) return false;
    if (text && readEditableText(element) === beforeText) return false;
    focusEditable(element);
    dispatchInputEvents(element, text);
    return true;
  } catch {
    return false;
  }
}

function insertIntoTextInput(element: HTMLInputElement | HTMLTextAreaElement, request: InsertionRequest): boolean {
  focusEditable(element);
  const start = request.preserveCommand ? element.selectionStart ?? element.value.length : request.replaceRange?.start ?? element.selectionStart ?? element.value.length;
  const end = request.preserveCommand ? element.selectionEnd ?? element.value.length : request.replaceRange?.end ?? element.selectionEnd ?? element.value.length;
  const before = element.value.slice(0, start);
  const after = element.value.slice(end);
  const spacer = request.preserveCommand && before && !/\s$/.test(before) ? " " : "";
  const nextValue = `${before}${spacer}${request.text}${after}`;
  element.value = nextValue;
  const caret = before.length + spacer.length + request.text.length;
  element.setSelectionRange(caret, caret);
  dispatchInputEvents(element, request.text);
  return element.value === nextValue;
}

function insertIntoContentEditable(element: HTMLElement, request: InsertionRequest): boolean {
  focusEditable(element);
  if (!request.preserveCommand && request.replaceRange) {
    const selectedRequestedRange = selectTextOffsets(element, request.replaceRange.start, request.replaceRange.end);
    if (!dispatchBeforeInputEvent(element, request.text)) return false;
    if (selectedRequestedRange && insertTextThroughEditorApi(element, request.text)) {
      return true;
    }

    const selection = document.getSelection();
    const text = readEditableText(element);
    const before = text.slice(0, request.replaceRange.start);
    const after = text.slice(request.replaceRange.end);
    const nodes = nodesForPlainText(`${before}${request.text}${after}`);
    element.replaceChildren(...nodes);
    const lastNode = nodes[nodes.length - 1];
    if (lastNode) moveSelectionAfter(lastNode, selection);
    focusEditable(element);
    dispatchInputEvents(element, request.text);
    return true;
  }

  const selection = document.getSelection();
  if (!selection) return false;
  if (!selection.rangeCount) {
    if (!dispatchBeforeInputEvent(element, request.text)) return false;
    element.append(...nodesForPlainText(request.text));
    focusEditable(element);
    dispatchInputEvents(element, request.text);
    return true;
  }
  const range = selection.getRangeAt(0);
  if (!element.contains(range.startContainer)) return false;

  if (!dispatchBeforeInputEvent(element, request.text)) return false;
  if (insertTextThroughEditorApi(element, request.text)) return true;

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
  return true;
}

function tryDirectInsertion(request: InsertionRequest): boolean {
  const element: EditableElement | null = request.target ?? getActiveEditable();
  try {
    return element
      ? isTextInput(element)
        ? insertIntoTextInput(element, request)
        : insertIntoContentEditable(element as HTMLElement, request)
      : false;
  } catch {
    return false;
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
      tryDirectInsertion({ ...request, text: "" });
    }
    return { mode: "clipboard", ok: true, message: `Copied — press ${modifier}` };
  }

  const inserted = tryDirectInsertion(request);
  if (inserted) return { mode: "direct", ok: true, message: "Inserted" };

  await copyToClipboard(request.text);
  return { mode: "clipboard", ok: true, message: `Copied — press ${modifier}` };
}
