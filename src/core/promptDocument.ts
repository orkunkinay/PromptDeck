import type { Prompt } from "../shared/models/prompt";
import type { AddPromptInput } from "./library";
import { resolvePromptContent } from "../shared/versioning/versionService";

export type PromptDocumentInput = Required<Pick<AddPromptInput, "command" | "content">> &
  Pick<AddPromptInput, "title" | "aliases" | "tags" | "description">;

const DOCUMENT_KEYS = new Set(["command", "title", "aliases", "tags", "description"]);

function isSimpleScalar(value: string): boolean {
  return value !== "" && /^[A-Za-z0-9_./ -]+$/.test(value) && !value.startsWith(" ") && !value.endsWith(" ");
}

function formatScalar(value: string): string {
  return isSimpleScalar(value) ? value : JSON.stringify(value);
}

function formatList(values: string[]): string {
  if (values.length === 0) return "[]";
  return `[${values.map(formatScalar).join(", ")}]`;
}

function parseScalar(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return "";
  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    try {
      return JSON.parse(trimmed.startsWith("'") ? `"${trimmed.slice(1, -1).replace(/"/g, '\\"')}"` : trimmed);
    } catch {
      throw new Error(`Invalid quoted value: ${trimmed}`);
    }
  }
  return trimmed;
}

function splitListItems(value: string): string[] {
  const items: string[] = [];
  let current = "";
  let quote: string | undefined;
  let escaped = false;

  for (const char of value) {
    if (escaped) {
      current += char;
      escaped = false;
      continue;
    }
    if (char === "\\" && quote === '"') {
      current += char;
      escaped = true;
      continue;
    }
    if ((char === '"' || char === "'") && (!quote || quote === char)) {
      quote = quote ? undefined : char;
      current += char;
      continue;
    }
    if (char === "," && !quote) {
      const item = current.trim();
      if (item) items.push(parseScalar(item));
      current = "";
      continue;
    }
    current += char;
  }

  if (quote) throw new Error("Unclosed quote in list value.");
  const item = current.trim();
  if (item) items.push(parseScalar(item));
  return items;
}

function parseList(value: string): string[] {
  const trimmed = value.trim();
  if (!trimmed) return [];
  if (trimmed.startsWith("[") || trimmed.endsWith("]")) {
    if (!trimmed.startsWith("[") || !trimmed.endsWith("]")) {
      throw new Error(`Invalid list value: ${trimmed}`);
    }
    return splitListItems(trimmed.slice(1, -1));
  }
  return splitListItems(trimmed);
}

function splitFrontmatter(text: string): { frontmatter: string; body: string } {
  let cursor: number;
  if (text.startsWith("---\r\n")) cursor = 5;
  else if (text.startsWith("---\n")) cursor = 4;
  else throw new Error("Prompt document must start with frontmatter delimited by ---.");

  while (cursor <= text.length) {
    const newline = text.indexOf("\n", cursor);
    const lineEnd = newline === -1 ? text.length : newline;
    const line = text.slice(cursor, lineEnd).replace(/\r$/, "");
    if (line === "---") {
      const bodyStart = newline === -1 ? text.length : newline + 1;
      return {
        frontmatter: text.slice(text.startsWith("---\r\n") ? 5 : 4, cursor),
        body: text.slice(bodyStart)
      };
    }
    if (newline === -1) break;
    cursor = newline + 1;
  }

  throw new Error("Prompt document frontmatter is missing a closing --- delimiter.");
}

/** Serialize a prompt to PromptDeck's editable frontmatter + markdown body format. */
export function serializePromptDocument(prompt: Prompt): string {
  const body = resolvePromptContent(prompt).content;
  const lines = [
    "---",
    `command: ${formatScalar(prompt.command)}`,
    `title: ${formatScalar(prompt.title)}`,
    `aliases: ${formatList(prompt.aliases)}`,
    `tags: ${formatList(prompt.tags)}`,
    `description: ${formatScalar(prompt.description)}`,
    "---",
    body
  ];
  return lines.join("\n");
}

/** Parse PromptDeck's editable frontmatter + markdown body format. */
export function parsePromptDocument(text: string): PromptDocumentInput {
  const { frontmatter, body } = splitFrontmatter(text);
  const values: Partial<PromptDocumentInput> = {};

  for (const rawLine of frontmatter.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const separator = line.indexOf(":");
    if (separator === -1) continue;
    const key = line.slice(0, separator).trim();
    if (!DOCUMENT_KEYS.has(key)) continue;
    const value = line.slice(separator + 1);
    if (key === "aliases" || key === "tags") values[key] = parseList(value);
    else values[key as "command" | "title" | "description"] = parseScalar(value);
  }

  if (!values.command || !values.command.trim()) {
    throw new Error("Prompt document frontmatter must include a non-empty command.");
  }

  return {
    command: values.command,
    title: values.title,
    aliases: values.aliases,
    tags: values.tags,
    description: values.description,
    content: body
  };
}

/** Create an empty editable prompt document skeleton for new prompt flows. */
export function promptTemplate(command = ""): string {
  return [
    "---",
    `command: ${command}`,
    "title: ",
    "aliases: []",
    "tags: []",
    "description: ",
    "---",
    ""
  ].join("\n");
}
