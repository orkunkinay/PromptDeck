const MAX_TRACKED_TEXT = 512;

/**
 * Tracks recent text from input events when a page hides its actual editor
 * behind a closed shadow root or another opaque editing surface.
 */
export class InputTextTracker {
  private text = "";

  reset(): void {
    this.text = "";
  }

  update(event: InputEvent): string {
    if (event.isComposing) return this.text;

    if (event.inputType === "deleteContentBackward") {
      this.text = this.text.slice(0, -1);
      return this.text;
    }

    if (event.inputType.startsWith("delete") || event.inputType === "historyUndo" || event.inputType === "historyRedo") {
      this.reset();
      return this.text;
    }

    if (event.inputType === "insertLineBreak" || event.inputType === "insertParagraph") {
      this.append("\n");
      return this.text;
    }

    if (event.inputType.startsWith("insert") && event.data) {
      this.append(event.data);
      return this.text;
    }

    // Unknown mutations cannot be reconstructed safely. Reset instead of
    // matching a trigger that may no longer be next to the caret.
    this.reset();
    return this.text;
  }

  private append(value: string): void {
    this.text = `${this.text}${value}`.slice(-MAX_TRACKED_TEXT);
  }
}
