import type { PromptVariableDefinition } from "../models/prompt";

export interface CompileInput {
  content: string;
  values?: Record<string, string>;
  definitions?: Record<string, PromptVariableDefinition>;
}

export interface CompileResult {
  compiled: string;
  variables: string[];
  missingRequired: string[];
  unusedValues: string[];
}

const VARIABLE_REGEX = /\{\{([a-zA-Z0-9_-]+)\}\}/g;

export function extractVariables(content: string): string[] {
  const found = new Set<string>();
  for (const match of content.matchAll(VARIABLE_REGEX)) {
    found.add(match[1]);
  }
  return [...found];
}

export function ensureVariableDefinitions(
  content: string,
  existing: Record<string, PromptVariableDefinition> = {}
): Record<string, PromptVariableDefinition> {
  const variables = extractVariables(content);
  const next: Record<string, PromptVariableDefinition> = {};

  for (const name of variables) {
    next[name] = existing[name] || {
      name,
      required: true,
      inputKind: name.includes("text") || name.includes("context") ? "textarea" : "text"
    };
  }

  return next;
}

export function compilePrompt(input: CompileInput): CompileResult {
  const variables = extractVariables(input.content);
  const values = input.values || {};
  const definitions = input.definitions || {};
  const missingRequired: string[] = [];

  const compiled = input.content.replace(VARIABLE_REGEX, (raw, name: string) => {
    const value = values[name];
    const definition = definitions[name];
    const fallback = definition?.defaultValue;
    const resolved = value ?? fallback;

    if ((resolved === undefined || resolved === "") && definition?.required !== false) {
      missingRequired.push(name);
      return raw;
    }

    return resolved ?? "";
  });

  const variableSet = new Set(variables);
  const unusedValues = Object.keys(values).filter((name) => !variableSet.has(name));

  return { compiled, variables, missingRequired: [...new Set(missingRequired)], unusedValues };
}
