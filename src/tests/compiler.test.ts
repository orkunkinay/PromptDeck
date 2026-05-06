import { describe, expect, it } from "vitest";
import { compilePrompt, ensureVariableDefinitions, extractVariables } from "../shared/promptCompiler/compiler";

describe("prompt compiler", () => {
  it("extracts unique variables", () => {
    expect(extractVariables("Hello {{tone}} {{paper_text}} {{tone}}")).toEqual(["tone", "paper_text"]);
  });

  it("compiles without trimming meaningful whitespace", () => {
    const result = compilePrompt({
      content: "A\n\n{{value}}\n  end",
      values: { value: "B  " },
      definitions: { value: { name: "value", required: true } }
    });
    expect(result.compiled).toBe("A\n\nB  \n  end");
    expect(result.missingRequired).toEqual([]);
  });

  it("reports missing required variables and unused values", () => {
    const result = compilePrompt({
      content: "{{paper_text}} {{tone}}",
      values: { tone: "formal", unused: "x" },
      definitions: ensureVariableDefinitions("{{paper_text}} {{tone}}")
    });
    expect(result.missingRequired).toEqual(["paper_text"]);
    expect(result.unusedValues).toEqual(["unused"]);
  });
});
