export type EditableElement = HTMLTextAreaElement | HTMLInputElement | HTMLElement;

export interface EditableSnapshot {
  text: string;
  selectionStart: number;
  selectionEnd: number;
  element: EditableElement;
}

export function isTextInput(element: Element | null): element is HTMLInputElement | HTMLTextAreaElement {
  if (!element) return false;
  if (element instanceof HTMLTextAreaElement) return true;
  if (!(element instanceof HTMLInputElement)) return false;
  const type = (element.type || "text").toLowerCase();
  return ["text", "search", "email", "url", "tel", "password"].includes(type);
}

export function isContentEditableElement(element: Element | null): element is HTMLElement {
  if (!(element instanceof HTMLElement)) return false;
  return Boolean(element.isContentEditable || element.contentEditable === "true" || element.closest("[contenteditable='true']"));
}

export function getActiveEditable(): EditableElement | null {
  const active = document.activeElement;
  if (isTextInput(active)) return active;
  if (isContentEditableElement(active)) return (active.closest("[contenteditable='true']") as HTMLElement) || active;
  return null;
}

export function getEditableSnapshot(element: EditableElement): EditableSnapshot | null {
  if (isTextInput(element)) {
    return {
      text: element.value,
      selectionStart: element.selectionStart ?? element.value.length,
      selectionEnd: element.selectionEnd ?? element.value.length,
      element
    };
  }

  const selection = document.getSelection();
  if (!selection || selection.rangeCount === 0) {
    const text = element.innerText || element.textContent || "";
    return { text, selectionStart: text.length, selectionEnd: text.length, element };
  }

  const range = selection.getRangeAt(0);
  if (!element.contains(range.startContainer)) return null;

  const before = range.cloneRange();
  before.selectNodeContents(element);
  before.setEnd(range.startContainer, range.startOffset);
  const selected = range.cloneContents().textContent || "";
  return {
    text: element.innerText || element.textContent || "",
    selectionStart: before.toString().length,
    selectionEnd: before.toString().length + selected.length,
    element
  };
}

export function caretRect(element: EditableElement): DOMRect {
  if (isTextInput(element)) return element.getBoundingClientRect();
  const selection = document.getSelection();
  if (selection?.rangeCount) {
    const range = selection.getRangeAt(0).cloneRange();
    range.collapse(true);
    const rect = range.getBoundingClientRect();
    if (rect.width || rect.height) return rect;
  }
  return element.getBoundingClientRect();
}
