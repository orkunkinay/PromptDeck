// Deterministic text serialization for contenteditable editors, shared by
// trigger detection (getEditableSnapshot) and insertion (offset mapping).
//
// Both sides must agree on a single coordinate space: the caret offset used to
// detect a trigger has to map back to the exact DOM position used to replace
// the typed command. Neither browser primitive gives us that on its own.
// Range.toString() drops the newlines between block elements, so a trigger at
// the start of a new paragraph looks glued to the previous paragraph's last
// character and fails the plausibility check. innerText inserts block newlines
// but its spacing is CSS-dependent, so its lengths do not line up with a Range
// caret offset. This module walks the DOM once with fixed rules — one "\n" per
// block boundary, one "\n" per <br> — so text, caret offset, and reverse offset
// lookup all share the same lengths.

export interface EditablePoint {
  node: Node;
  offset: number;
}

interface TextSegment {
  node: Text;
  start: number;
  length: number;
}

export interface EditableSerialization {
  text: string;
  segments: TextSegment[];
  /** Output offset for the requested point, or null when none was requested/found. */
  offset: number | null;
}

const BLOCK_TAGS = new Set([
  "ADDRESS",
  "ARTICLE",
  "ASIDE",
  "BLOCKQUOTE",
  "DD",
  "DETAILS",
  "DIALOG",
  "DIV",
  "DL",
  "DT",
  "FIELDSET",
  "FIGCAPTION",
  "FIGURE",
  "FOOTER",
  "FORM",
  "H1",
  "H2",
  "H3",
  "H4",
  "H5",
  "H6",
  "HEADER",
  "HGROUP",
  "HR",
  "LI",
  "MAIN",
  "NAV",
  "OL",
  "P",
  "PRE",
  "SECTION",
  "TABLE",
  "TR",
  "UL"
]);

function isBlockElement(node: Node): node is HTMLElement {
  return node instanceof HTMLElement && BLOCK_TAGS.has(node.tagName);
}

/**
 * Serialize the editable subtree into text with deterministic block/line
 * newlines. When a `point` is supplied its position is captured as `offset` in
 * the same coordinate space as the returned text.
 */
export function serializeEditable(root: HTMLElement, point?: EditablePoint): EditableSerialization {
  let text = "";
  const segments: TextSegment[] = [];
  let offset: number | null = null;

  const captureElementPoint = (node: Node, childIndex: number): void => {
    if (point && point.node === node && point.offset === childIndex) offset = text.length;
  };

  const appendBlockSeparator = (): void => {
    if (text.length && !text.endsWith("\n")) text += "\n";
  };

  const walk = (node: Node): void => {
    const children = node.childNodes;
    for (let index = 0; index < children.length; index += 1) {
      captureElementPoint(node, index);
      const child = children[index];
      if (child.nodeType === Node.TEXT_NODE) {
        const content = child.textContent ?? "";
        if (point && point.node === child) offset = text.length + Math.min(point.offset, content.length);
        segments.push({ node: child as Text, start: text.length, length: content.length });
        text += content;
      } else if (child instanceof HTMLBRElement) {
        if (point && point.node === child) offset = text.length;
        text += "\n";
      } else if (child instanceof HTMLElement) {
        if (isBlockElement(child)) appendBlockSeparator();
        walk(child);
      }
    }
    captureElementPoint(node, children.length);
  };

  walk(root);
  return { text, segments, offset };
}

/**
 * Map a text-space offset back to a DOM (node, offset) position, using the same
 * serialization rules as {@link serializeEditable}.
 */
export function domPointForOffset(root: HTMLElement, target: number): EditablePoint {
  const { segments } = serializeEditable(root);
  for (const segment of segments) {
    if (target <= segment.start + segment.length) {
      return { node: segment.node, offset: Math.max(0, target - segment.start) };
    }
  }
  const last = segments[segments.length - 1];
  if (last) return { node: last.node, offset: last.length };
  return { node: root, offset: root.childNodes.length };
}
