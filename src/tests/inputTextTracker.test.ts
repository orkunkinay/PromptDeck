import { describe, expect, it } from "vitest";
import { InputTextTracker } from "../content/commandDetection/inputTextTracker";

function input(inputType: string, data: string | null = null): InputEvent {
  return new InputEvent("input", { inputType, data });
}

describe("InputTextTracker", () => {
  it("reconstructs typed trigger commands and backspaces", () => {
    const tracker = new InputTextTracker();

    expect(tracker.update(input("insertText", ";"))).toBe(";");
    expect(tracker.update(input("insertText", ";"))).toBe(";;");
    expect(tracker.update(input("insertText", "blog"))).toBe(";;blog");
    expect(tracker.update(input("deleteContentBackward"))).toBe(";;blo");
  });

  it("resets after mutations whose caret position cannot be reconstructed", () => {
    const tracker = new InputTextTracker();
    tracker.update(input("insertText", ";;blog"));

    expect(tracker.update(input("deleteWordBackward"))).toBe("");
    expect(tracker.update(input("insertFromDrop"))).toBe("");
  });
});
