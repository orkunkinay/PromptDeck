import { describe, expect, it } from "vitest";
import { parseCommandAt } from "../content/commandDetection/commandParser";

describe("parseCommandAt", () => {
  it("detects configured trigger commands at line start and after whitespace", () => {
    expect(parseCommandAt(";;paper-reading", ";;paper-reading".length)?.command).toBe("/paper-reading");
    expect(parseCommandAt("Can you use ;;paper-reading", "Can you use ;;paper-reading".length)?.command).toBe("/paper-reading");
    expect(parseCommandAt("Use ;;blog-evolution:long", "Use ;;blog-evolution:long".length)?.suffix).toBe("long");
    expect(parseCommandAt("Use ;;blog-evolution:long", "Use ;;blog-evolution:long".length)?.query).toBe("/blog-evolution");
    expect(parseCommandAt("Can you use ;;paper", "Can you use ;;paper".length)?.query).toBe("/paper");
  });

  it("does not trigger on slash usage anymore", () => {
    expect(parseCommandAt("https://example.com/path", 24)).toBeNull();
    expect(parseCommandAt("3/4", 3)).toBeNull();
    expect(parseCommandAt("2026/05/05", 10)).toBeNull();
    expect(parseCommandAt("/Users", 6)).toBeNull();
    expect(parseCommandAt("/Users/name/file", 16)).toBeNull();
    expect(parseCommandAt("a/b", 3)).toBeNull();
  });

  it("supports alternate trigger strings", () => {
    expect(parseCommandAt("//paper-reading", "//paper-reading".length, "//")?.command).toBe("/paper-reading");
    expect(parseCommandAt("Ask /p", "Ask /p".length, "/p")).not.toBeNull();
  });
});
