import { describe, expect, it } from "vitest";
import { findPrompt, parseToken, resolveToken } from "../core/resolve";
import { seedPrompts } from "../shared/seedPrompts";

describe("parseToken", () => {
  it("parses a bare name", () => {
    expect(parseToken("paper")).toEqual({ name: "paper" });
  });

  it("strips a leading slash", () => {
    expect(parseToken("/paper-reading")).toEqual({ name: "paper-reading" });
  });

  it("splits name and suffix", () => {
    expect(parseToken("paper:short")).toEqual({ name: "paper", suffix: "short" });
  });

  it("splits a slashed command with a version suffix", () => {
    expect(parseToken("/paper-reading:v2")).toEqual({ name: "paper-reading", suffix: "v2" });
  });
});

describe("findPrompt", () => {
  it("matches an exact command", () => {
    expect(findPrompt(seedPrompts, "paper-reading")?.id).toBe("paper-reading");
  });

  it("matches an alias", () => {
    expect(findPrompt(seedPrompts, "paper")?.id).toBe("paper-reading");
  });

  it("matches by id", () => {
    expect(findPrompt(seedPrompts, "blog-evolution")?.id).toBe("blog-evolution");
  });

  it("returns undefined when nothing matches", () => {
    expect(findPrompt(seedPrompts, "zzzzzznope")).toBeUndefined();
  });
});

describe("resolveToken", () => {
  it("resolves a variant suffix", () => {
    const resolution = resolveToken(seedPrompts, "paper:short");
    expect(resolution?.resolved.kind).toBe("variant");
    expect(resolution?.resolved.content).toContain("8 bullets");
  });

  it("resolves default content without a suffix", () => {
    const resolution = resolveToken(seedPrompts, "/paper-reading");
    expect(resolution?.resolved.kind).toBe("default");
    expect(resolution?.resolved.content).toContain("structured research brief");
  });

  it("falls back to the default version for an unknown suffix", () => {
    const resolution = resolveToken(seedPrompts, "paper:nope");
    expect(resolution?.resolved.kind).toBe("default");
  });
});
