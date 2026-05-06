import { afterEach, describe, expect, it, vi } from "vitest";
import { consumePromptDeckKeyboardEvent } from "../content/keyboard/keyboardOwnership";
import { insertOrCopy } from "../content/insertion/insertionService";

describe("content keyboard handling", () => {
  afterEach(() => {
    document.body.replaceChildren();
    vi.restoreAllMocks();
  });

  it("allows host Enter behavior when PromptDeck autocomplete is closed", () => {
    const editor = document.createElement("textarea");
    let submitted = 0;
    editor.addEventListener("keydown", (event) => {
      if (event.key === "Enter" && !event.defaultPrevented) submitted += 1;
    });
    document.body.append(editor);
    editor.focus();

    editor.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true }));

    expect(submitted).toBe(1);
  });

  it("consumes Enter before a host submit handler and inserts the selected prompt", async () => {
    const editor = document.createElement("textarea");
    editor.value = ";;paper";
    document.body.append(editor);
    editor.focus();
    editor.setSelectionRange(editor.value.length, editor.value.length);

    let submitted = 0;
    editor.addEventListener("keydown", (event) => {
      if (event.key === "Enter" && !event.defaultPrevented) submitted += 1;
    });

    const promptDeckHandler = (event: KeyboardEvent): void => {
      if (event.key !== "Enter") return;
      consumePromptDeckKeyboardEvent(event);
      void insertOrCopy({
        text: "Paper prompt body",
        replaceRange: { start: 0, end: 7 },
        target: editor
      });
    };
    document.addEventListener("keydown", promptDeckHandler, true);

    const event = new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true });
    editor.dispatchEvent(event);
    await Promise.resolve();

    expect(event.defaultPrevented).toBe(true);
    expect(submitted).toBe(0);
    expect(editor.value).toBe("Paper prompt body");
    expect(document.activeElement).toBe(editor);

    document.removeEventListener("keydown", promptDeckHandler, true);
    editor.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true }));

    expect(submitted).toBe(1);
  });

  it("consumes Enter before a contenteditable host submit handler and inserts the selected prompt", async () => {
    const editor = document.createElement("div");
    editor.contentEditable = "true";
    editor.tabIndex = 0;
    editor.textContent = ";;paper";
    document.body.append(editor);
    editor.focus();

    const range = document.createRange();
    range.selectNodeContents(editor);
    range.collapse(false);
    const selection = document.getSelection();
    selection?.removeAllRanges();
    selection?.addRange(range);

    let submitted = 0;
    editor.addEventListener("keydown", (event) => {
      if (event.key === "Enter" && !event.defaultPrevented) submitted += 1;
    });

    const promptDeckHandler = (event: KeyboardEvent): void => {
      if (event.key !== "Enter") return;
      consumePromptDeckKeyboardEvent(event);
      void insertOrCopy({
        text: "Paper prompt body",
        replaceRange: { start: 0, end: 7 },
        target: editor
      });
    };
    document.addEventListener("keydown", promptDeckHandler, true);

    const event = new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true });
    editor.dispatchEvent(event);
    await Promise.resolve();

    expect(event.defaultPrevented).toBe(true);
    expect(submitted).toBe(0);
    expect(editor.textContent).toBe("Paper prompt body");
    expect(document.activeElement).toBe(editor);

    document.removeEventListener("keydown", promptDeckHandler, true);
  });
});
