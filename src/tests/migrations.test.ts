import { describe, expect, it } from "vitest";
import { migrateExport } from "../shared/storage/migrations";

describe("migrations", () => {
  it("normalizes pre-v1 exports", () => {
    const migrated = migrateExport({
      schemaVersion: 0,
      exportedAt: "now",
      prompts: [
        {
          id: "x",
          title: "X",
          command: "/x",
          aliases: [],
          tags: [],
          description: "",
          defaultVersionId: "v1",
          variants: [],
          versions: [],
          variables: {},
          createdAt: "now",
          updatedAt: "now",
          usageCount: 0
        }
      ]
    });
    expect(migrated.schemaVersion).toBe(1);
  });
});
