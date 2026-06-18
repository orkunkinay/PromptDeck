import { afterEach, describe, expect, it, vi } from "vitest";
import { createEditorAdapters, resolveEditorAdapter } from "../content/adapters/siteAdapter";
import { copyToClipboard, insertOrCopy } from "../content/insertion/insertionService";

describe("insertionService", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("replaces typed command in textarea", async () => {
    const textarea = document.createElement("textarea");
    textarea.value = "Please ;;paper-reading now";
    document.body.append(textarea);
    textarea.focus();
    textarea.setSelectionRange(21, 21);
    const result = await insertOrCopy({
      text: "compiled prompt",
      replaceRange: { start: 7, end: 22 }
    });
    expect(result.mode).toBe("direct");
    expect(textarea.value).toBe("Please compiled prompt now");
    textarea.remove();
  });

  it("can preserve command text on shift-enter style insertion", async () => {
    const input = document.createElement("input");
    input.value = ";;paper-reading";
    document.body.append(input);
    input.focus();
    input.setSelectionRange(input.value.length, input.value.length);
    await insertOrCopy({ text: "compiled", replaceRange: { start: 0, end: 15 }, preserveCommand: true });
    expect(input.value).toBe(";;paper-reading compiled");
    input.remove();
  });

  it("copies and removes the typed trigger in clipboard mode", async () => {
    const input = document.createElement("input");
    input.value = "Use ;;paper";
    document.body.append(input);
    input.focus();
    input.setSelectionRange(input.value.length, input.value.length);

    const result = await insertOrCopy(
      {
        text: "compiled prompt",
        replaceRange: { start: 4, end: 11 }
      },
      true
    );

    expect(result.mode).toBe("clipboard");
    expect(input.value).toBe("Use ");
    input.remove();
  });

  it("uses the provided target when the helper UI has focus", async () => {
    const input = document.createElement("input");
    input.value = "Use ;;paper";
    const helperButton = document.createElement("button");
    document.body.append(input, helperButton);
    helperButton.focus();

    const result = await insertOrCopy(
      {
        text: "compiled prompt",
        replaceRange: { start: 4, end: 11 },
        target: input
      },
      true
    );

    expect(result.mode).toBe("clipboard");
    expect(input.value).toBe("Use ");
    input.remove();
    helperButton.remove();
  });

  it("preserves line breaks when inserting into contenteditable fields", async () => {
    const editor = document.createElement("div");
    editor.contentEditable = "true";
    editor.tabIndex = 0;
    editor.textContent = "Use ;;paper";
    document.body.append(editor);

    const result = await insertOrCopy({
      text: "First line\n\nSecond line",
      replaceRange: { start: 4, end: 11 },
      target: editor
    });

    expect(result.mode).toBe("direct");
    expect(editor.querySelectorAll("br")).toHaveLength(2);
    expect(editor.innerHTML).toContain("First line");
    expect(editor.innerHTML).toContain("Second line");
    editor.remove();
  });

  it("uses the editor text insertion API for contenteditable replacement so rich editors keep newlines", async () => {
    const editor = document.createElement("div");
    editor.contentEditable = "true";
    editor.tabIndex = 0;
    editor.textContent = "Use ;;paper";
    document.body.append(editor);
    editor.focus();

    const execCommand = vi.fn((command: string, _showUI?: boolean, value?: string) => {
      if (command !== "insertText" || value === undefined) return false;
      const selection = document.getSelection();
      if (!selection?.rangeCount) return false;
      const range = selection.getRangeAt(0);
      range.deleteContents();
      const node = document.createTextNode(value);
      range.insertNode(node);
      range.setStartAfter(node);
      range.collapse(true);
      selection.removeAllRanges();
      selection.addRange(range);
      editor.dispatchEvent(new InputEvent("input", { bubbles: true, inputType: "insertText" }));
      return true;
    });
    Object.defineProperty(document, "execCommand", { configurable: true, value: execCommand });

    const result = await insertOrCopy({
      text: "First line\n\nSecond line",
      replaceRange: { start: 4, end: 11 },
      target: editor
    });

    expect(result.mode).toBe("direct");
    expect(execCommand).toHaveBeenCalledWith("insertText", false, "First line\n\nSecond line");
    expect(editor.textContent).toBe("Use First line\n\nSecond line");
    editor.remove();
  });

  it("sends beforeinput and input events with inserted text data for contenteditable fallback insertion", async () => {
    const editor = document.createElement("div");
    editor.contentEditable = "true";
    editor.tabIndex = 0;
    editor.textContent = "Use ;;paper";
    document.body.append(editor);
    editor.focus();
    const events: Array<{ type: string; data: string | null; inputType: string }> = [];
    editor.addEventListener("beforeinput", (event) => {
      const inputEvent = event as InputEvent;
      events.push({ type: event.type, data: inputEvent.data, inputType: inputEvent.inputType });
    });
    editor.addEventListener("input", (event) => {
      const inputEvent = event as InputEvent;
      events.push({ type: event.type, data: inputEvent.data, inputType: inputEvent.inputType });
    });
    Object.defineProperty(document, "execCommand", { configurable: true, value: vi.fn().mockReturnValue(false) });

    const result = await insertOrCopy({
      text: "First line\nSecond line",
      replaceRange: { start: 4, end: 11 },
      target: editor
    });

    expect(result.mode).toBe("direct");
    expect(events).toEqual([
      { type: "beforeinput", data: "First line\nSecond line", inputType: "insertText" },
      { type: "input", data: "First line\nSecond line", inputType: "insertText" }
    ]);
    expect(document.activeElement).toBe(editor);
    editor.remove();
  });

  it("lets concrete rich editor adapters apply insertion through beforeinput", async () => {
    const editor = document.createElement("div");
    editor.className = "ProseMirror";
    editor.contentEditable = "true";
    editor.tabIndex = 0;
    editor.textContent = "Use ;;paper";
    document.body.append(editor);
    editor.focus();
    editor.addEventListener("beforeinput", (event) => {
      event.preventDefault();
      const inputEvent = event as InputEvent;
      const selection = document.getSelection();
      if (!selection?.rangeCount) return;
      const range = selection.getRangeAt(0);
      range.deleteContents();
      const node = document.createTextNode(inputEvent.data ?? "");
      range.insertNode(node);
      range.setStartAfter(node);
      range.collapse(true);
      selection.removeAllRanges();
      selection.addRange(range);
    });
    const execCommand = vi.fn().mockReturnValue(false);
    Object.defineProperty(document, "execCommand", { configurable: true, value: execCommand });

    const result = await insertOrCopy({
      text: "compiled prompt",
      replaceRange: { start: 4, end: 11 },
      target: editor
    });

    expect(result.mode).toBe("direct");
    expect(result.adapterId).toBe("prosemirror");
    expect(execCommand).not.toHaveBeenCalled();
    expect(editor.textContent).toBe("Use compiled prompt");
    editor.remove();
  });

  it("falls back to clipboard when a concrete rich editor adapter cannot verify insertion", async () => {
    const editor = document.createElement("div");
    editor.className = "ProseMirror";
    editor.contentEditable = "true";
    editor.tabIndex = 0;
    editor.textContent = "Use ;;paper";
    document.body.append(editor);
    const replaceChildren = vi.spyOn(editor, "replaceChildren");
    Object.defineProperty(document, "execCommand", { configurable: true, value: vi.fn().mockReturnValue(false) });
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText }
    });

    const result = await insertOrCopy({
      text: "compiled prompt",
      replaceRange: { start: 4, end: 11 },
      target: editor
    });

    expect(result.mode).toBe("clipboard");
    expect(writeText).toHaveBeenCalledWith("compiled prompt");
    expect(replaceChildren).not.toHaveBeenCalled();
    expect(editor.textContent).toBe("Use ;;paper");
    editor.remove();
  });

  it("resolves specialized editor adapters before the generic contenteditable fallback", () => {
    const calls: string[] = [];
    const adapters = createEditorAdapters({
      textInput: () => ({ mode: "direct", ok: true, message: "text-input", adapterId: "text-input" }),
      richContentEditable: (_request, adapterId) => {
        calls.push(adapterId);
        return { mode: "direct", ok: true, message: adapterId, adapterId };
      },
      genericContentEditable: () => ({ mode: "direct", ok: true, message: "generic", adapterId: "generic-contenteditable" })
    });
    const codeMirror = document.createElement("div");
    codeMirror.className = "cm-content";
    codeMirror.contentEditable = "true";
    const generic = document.createElement("div");
    generic.contentEditable = "true";

    expect(resolveEditorAdapter(adapters, codeMirror, "example.com")?.id).toBe("codemirror");
    expect(resolveEditorAdapter(adapters, generic, "example.com")?.id).toBe("generic-contenteditable");
    expect(calls).toEqual([]);
  });

  it("copies both plain text and html line breaks when structured clipboard is available", async () => {
    class TestClipboardItem {
      constructor(public readonly items: Record<string, Blob>) {}
    }
    const write = vi.fn().mockResolvedValue(undefined);
    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal("ClipboardItem", TestClipboardItem);
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { write, writeText }
    });

    await copyToClipboard("First line\r\n\r\nSecond <line>");

    expect(write).toHaveBeenCalledOnce();
    expect(writeText).not.toHaveBeenCalled();
    const item = write.mock.calls[0][0][0] as TestClipboardItem;
    await expect(readBlobText(item.items["text/plain"])).resolves.toBe("First line\r\n\r\nSecond <line>");
    await expect(readBlobText(item.items["text/html"])).resolves.toBe(
      '<meta charset="utf-8"><!--StartFragment--><p style="margin: 0; white-space: pre-wrap;">First line</p><p style="margin: 0; white-space: pre-wrap;">&nbsp;</p><p style="margin: 0; white-space: pre-wrap;">Second &lt;line&gt;</p><!--EndFragment-->'
    );
  });

  it("falls back to copy events with html blocks when structured clipboard is blocked", async () => {
    const write = vi.fn().mockRejectedValue(new Error("blocked"));
    const writeText = vi.fn().mockResolvedValue(undefined);
    const clipboardData = {
      values: new Map<string, string>(),
      setData(type: string, value: string) {
        this.values.set(type, value);
      }
    };
    const execCommand = vi.spyOn(document, "execCommand").mockImplementation((command) => {
      if (command !== "copy") return false;
      const event = new Event("copy", { bubbles: true, cancelable: true });
      Object.defineProperty(event, "clipboardData", { value: clipboardData });
      document.dispatchEvent(event);
      return true;
    });
    class TestClipboardItem {
      constructor(public readonly items: Record<string, Blob>) {}
    }
    vi.stubGlobal("ClipboardItem", TestClipboardItem);
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { write, writeText }
    });

    await copyToClipboard("First\n\nSecond");

    expect(write).toHaveBeenCalledOnce();
    expect(execCommand).toHaveBeenCalledWith("copy");
    expect(writeText).not.toHaveBeenCalled();
    expect(clipboardData.values.get("text/plain")).toBe("First\r\n\r\nSecond");
    expect(clipboardData.values.get("text/html")).toBe(
      '<meta charset="utf-8"><!--StartFragment--><p style="margin: 0; white-space: pre-wrap;">First</p><p style="margin: 0; white-space: pre-wrap;">&nbsp;</p><p style="margin: 0; white-space: pre-wrap;">Second</p><!--EndFragment-->'
    );
  });
});

function readBlobText(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error);
    reader.onload = () => resolve(String(reader.result));
    reader.readAsText(blob);
  });
}
