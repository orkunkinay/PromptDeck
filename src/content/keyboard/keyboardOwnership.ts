const OWNED_KEYS = new Set(["ArrowDown", "ArrowUp", "Enter", "Escape", "Tab"]);

export function isPromptDeckOwnedKey(event: KeyboardEvent): boolean {
  if (event.isComposing) return false;
  if (OWNED_KEYS.has(event.key)) return true;
  return (event.metaKey || event.ctrlKey) && event.key === "ArrowDown";
}

export function consumePromptDeckKeyboardEvent(event: KeyboardEvent): void {
  event.preventDefault();
  event.stopPropagation();
  event.stopImmediatePropagation();
}
