import { beforeEach, describe, expect, it, vi } from "vitest";
import { notifyPromptDeckStateChanged, PROMPTDECK_STATE_KEY } from "../shared/state/stateInvalidation";

describe("state invalidation", () => {
  beforeEach(() => {
    vi.mocked(chrome.storage.local.set).mockClear();
  });

  it("writes a chrome.storage.local signal for content script refreshes", async () => {
    await notifyPromptDeckStateChanged("prompts");

    expect(chrome.storage.local.set).toHaveBeenCalledTimes(1);
    const payload = vi.mocked(chrome.storage.local.set).mock.calls[0][0] as Record<string, unknown>;
    expect(payload).toHaveProperty(PROMPTDECK_STATE_KEY);
    expect(payload[PROMPTDECK_STATE_KEY]).toMatchObject({ reason: "prompts" });
  });
});
