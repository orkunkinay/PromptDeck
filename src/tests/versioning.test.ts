import { describe, expect, it } from "vitest";
import { seedPrompts } from "../shared/seedPrompts";
import { createVersion, deleteVersion, resolvePromptContent, restoreVersionAsLatest, setDefaultVersion } from "../shared/versioning/versionService";
import { upsertVariant } from "../shared/versioning/variantService";

describe("versioning and variants", () => {
  it("creates immutable latest versions and sets default", () => {
    const prompt = createVersion(seedPrompts[0], "new content", "Changed");
    expect(prompt.versions.map((version) => version.id)).toContain("v2");
    expect(prompt.defaultVersionId).toBe("v2");
    expect(seedPrompts[0].versions).toHaveLength(1);
  });

  it("sets default version and restores old versions as new latest", () => {
    const v2 = createVersion(seedPrompts[0], "new content");
    const defaulted = setDefaultVersion(v2, "v1");
    expect(defaulted.defaultVersionId).toBe("v1");
    const restored = restoreVersionAsLatest(defaulted, "v1");
    expect(restored.defaultVersionId).toBe("v3");
  });

  it("resolves versions before variants for suffix collisions", () => {
    const prompt = upsertVariant(createVersion(seedPrompts[0], "version two"), {
      name: "v2",
      suffix: "v2",
      content: "variant v2"
    });
    expect(resolvePromptContent(prompt, "v2").kind).toBe("version");
    expect(resolvePromptContent(prompt, "short").kind).toBe("variant");
  });

  it("deletes a non-final version and moves default when needed", () => {
    const v2 = createVersion(seedPrompts[0], "version two");
    const v3 = createVersion(v2, "version three");
    const withoutDefault = deleteVersion(v3, "v3");

    expect(withoutDefault.versions.map((version) => version.id)).toEqual(["v1", "v2"]);
    expect(withoutDefault.defaultVersionId).toBe("v2");
    expect(withoutDefault.versions.find((version) => version.id === "v2")?.isDefault).toBe(true);
  });

  it("keeps at least one version", () => {
    expect(() => deleteVersion(seedPrompts[0], "v1")).toThrow("at least one version");
  });
});
