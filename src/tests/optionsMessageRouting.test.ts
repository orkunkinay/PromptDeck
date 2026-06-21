import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { PromptDeckSettings } from "../shared/models/prompt";
import { defaultSettings } from "../shared/settings/defaultSettings";
import { seedPrompts } from "../shared/seedPrompts";

const mocks = vi.hoisted(() => ({
  save: vi.fn(),
  deletePrompt: vi.fn(),
  duplicate: vi.fn(),
  recordUsage: vi.fn(),
  replaceAll: vi.fn(),
  list: vi.fn(),
  getSettings: vi.fn(),
  saveSettings: vi.fn()
}));

vi.mock("../shared/storage/promptRepository", () => ({
  promptRepository: {
    list: mocks.list,
    save: mocks.save,
    delete: mocks.deletePrompt,
    duplicate: mocks.duplicate,
    recordUsage: mocks.recordUsage,
    replaceAll: mocks.replaceAll,
    ensureSeeded: vi.fn()
  }
}));

vi.mock("../shared/settings/settingsService", () => ({
  settingsService: {
    get: mocks.getSettings,
    save: mocks.saveSettings
  }
}));

describe("options message routing", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("handles options write messages through the background handler", async () => {
    const { handleMessage } = await import("../background");
    const prompt = seedPrompts[0];
    const settings: PromptDeckSettings = { ...defaultSettings, trigger: ";;" };

    mocks.save.mockResolvedValue(prompt);
    mocks.replaceAll.mockResolvedValue(undefined);
    mocks.deletePrompt.mockResolvedValue(undefined);
    mocks.saveSettings.mockResolvedValue(settings);

    await expect(
      handleMessage({ type: "PROMPTS_SAVE", prompt: prompt as never, content: "body", minorEdit: false, changelog: "Saved" })
    ).resolves.toEqual({ ok: true, data: prompt });
    await expect(handleMessage({ type: "PROMPTS_DELETE", id: "p" })).resolves.toEqual({ ok: true });
    await expect(handleMessage({ type: "PROMPTS_REPLACE_ALL", prompts: [prompt as never] })).resolves.toEqual({ ok: true });
    await expect(handleMessage({ type: "SETTINGS_SAVE", settings })).resolves.toEqual({ ok: true, data: settings });

    expect(mocks.save).toHaveBeenCalledWith(prompt, { content: "body", minorEdit: false, changelog: "Saved" });
    expect(mocks.deletePrompt).toHaveBeenCalledWith("p");
    expect(mocks.replaceAll).toHaveBeenCalledWith([prompt]);
    expect(mocks.saveSettings).toHaveBeenCalledWith(settings);
  });

  it("rejects malformed PROMPTS_SAVE messages without persisting", async () => {
    const { handleMessage } = await import("../background");

    await expect(handleMessage({ type: "PROMPTS_SAVE", prompt: { id: "p", title: "Prompt" } })).resolves.toEqual({
      ok: false,
      error: "Invalid PROMPTS_SAVE message: prompt must be a valid prompt."
    });

    expect(mocks.save).not.toHaveBeenCalled();
  });

  it("keeps options-page writes on runtime messages instead of direct repositories", () => {
    const source = readFileSync(resolve(process.cwd(), "src/options/main.tsx"), "utf8");

    expect(source).not.toMatch(/promptRepository\.(save|delete|duplicate|replaceAll|recordUsage)\(/);
    expect(source).not.toMatch(/settingsService\.(save|get)\(/);
    expect(source).toContain('type: "PROMPTS_SAVE"');
    expect(source).toContain('type: "PROMPTS_DELETE"');
    expect(source).toContain('type: "PROMPTS_REPLACE_ALL"');
    expect(source).toContain('type: "SETTINGS_SAVE"');
  });
});
