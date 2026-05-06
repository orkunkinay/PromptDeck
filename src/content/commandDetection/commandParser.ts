export interface ParsedCommand {
  raw: string;
  command: string;
  suffix?: string;
  start: number;
  end: number;
  query: string;
  exactish: boolean;
}

const START_CHARS = new Set([" ", "\n", "\t", "(", "[", "{", ":", ";", ",", ".", "!", "?"]);
const COMMAND_BODY = "[a-zA-Z0-9][a-zA-Z0-9-_]*";

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function normalizeTrigger(trigger: string): string {
  return trigger || ";;";
}

function isPlausibleStart(text: string, start: number): boolean {
  if (start === 0) return true;
  return START_CHARS.has(text[start - 1]);
}

export function parseCommandAt(text: string, caret: number, trigger = ";;"): ParsedCommand | null {
  const normalizedTrigger = normalizeTrigger(trigger);
  const beforeCaret = text.slice(0, caret);
  const start = beforeCaret.lastIndexOf(normalizedTrigger);
  if (start === -1) return null;
  if (!isPlausibleStart(text, start)) return null;

  const fragment = beforeCaret.slice(start);
  const body = fragment.slice(normalizedTrigger.length);
  if (/\s/.test(body)) return null;
  if (body && !new RegExp(`^${COMMAND_BODY}?(?::${COMMAND_BODY}?)?$`).test(body)) return null;

  const [name, suffixPart] = body.split(":");
  const hasValidName = new RegExp(`^${COMMAND_BODY}$`).test(name || "");
  const hasValidSuffix = suffixPart !== undefined && new RegExp(`^${COMMAND_BODY}$`).test(suffixPart);
  const command = hasValidName ? `/${name}` : "/";

  return {
    raw: fragment,
    command,
    suffix: hasValidSuffix ? suffixPart : undefined,
    start,
    end: caret,
    query: hasValidName ? `/${name}` : body ? `/${body}` : "",
    exactish: hasValidName && (suffixPart === undefined || hasValidSuffix)
  };
}

export function findCommands(text: string, trigger = ";;"): ParsedCommand[] {
  const results: ParsedCommand[] = [];
  const pattern = new RegExp(`${escapeRegex(normalizeTrigger(trigger))}${COMMAND_BODY}(?::${COMMAND_BODY})?`, "g");
  for (const match of text.matchAll(pattern)) {
    const parsed = parseCommandAt(text, (match.index || 0) + match[0].length, trigger);
    if (parsed) results.push(parsed);
  }
  return results;
}
