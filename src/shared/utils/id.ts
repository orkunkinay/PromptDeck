export function nowIso(): string {
  return new Date().toISOString();
}

export function createId(prefix = "id"): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return `${prefix}_${crypto.randomUUID()}`;
  }
  return `${prefix}_${Math.random().toString(36).slice(2)}_${Date.now().toString(36)}`;
}

export function commandToId(command: string): string {
  return command.replace(/^\//, "").toLowerCase().replace(/[^a-z0-9-_]+/g, "-");
}

export const MAX_PROMPT_TITLE_LENGTH = 30;

export function limitPromptTitle(title: string): string {
  return title.slice(0, MAX_PROMPT_TITLE_LENGTH);
}

export function titleFromCommand(command: string): string {
  return limitPromptTitle(command
    .replace(/^\//, "")
    .split(/[-_]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" "));
}
