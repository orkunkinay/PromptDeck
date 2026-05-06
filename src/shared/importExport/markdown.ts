import type { Prompt } from "../models/prompt";
import { getDefaultVersion } from "../versioning/versionService";

function yamlList(values: string[]): string {
  return values.length ? values.map((value) => `  - ${value}`).join("\n") : "[]";
}

export function promptToMarkdown(prompt: Prompt): string {
  const version = getDefaultVersion(prompt);
  return [
    "---",
    `id: ${prompt.id}`,
    `command: ${prompt.command}`,
    "aliases:",
    yamlList(prompt.aliases),
    "tags:",
    yamlList(prompt.tags),
    `defaultVersionId: ${prompt.defaultVersionId}`,
    "---",
    "",
    `# ${prompt.title}`,
    "",
    version.content
  ].join("\n");
}
