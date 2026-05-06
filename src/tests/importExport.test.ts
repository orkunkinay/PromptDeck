import { describe, expect, it } from "vitest";
import { exportJson, parseImportJson, stringifyExport } from "../shared/importExport/json";
import { seedPrompts } from "../shared/seedPrompts";

describe("import/export", () => {
  it("roundtrips JSON exports", () => {
    const exported = exportJson(seedPrompts);
    const parsed = parseImportJson(stringifyExport(exported));
    expect(parsed.prompts).toHaveLength(seedPrompts.length);
    expect(parsed.prompts[0].versions[0].content).toBe(seedPrompts[0].versions[0].content);
  });

  it("shows validation errors", () => {
    expect(() => parseImportJson("{ bad")).toThrow("valid JSON");
    expect(() => parseImportJson(JSON.stringify({ prompts: [{}] }))).toThrow("missing required fields");
  });
});
