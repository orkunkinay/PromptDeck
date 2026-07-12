import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { App } from "../options/main";
import { AppShell } from "../options/AppShell";
import { PromptEditor } from "../options/PromptEditor";
import { Sidebar } from "../options/Sidebar";
import { VersionRail } from "../options/VersionRail";
import type { Prompt, PromptDeckSettings } from "../shared/models/prompt";
import { searchPrompts } from "../shared/search/fuzzySearch";
import { defaultSettings } from "../shared/settings/defaultSettings";
import { SETTINGS_KEY } from "../shared/settings/settingsService";
import { createPromptFromCommand } from "../shared/storage/promptRepository";
import { PROMPTDECK_STATE_KEY } from "../shared/state/stateInvalidation";
import { nextBlankPromptCommand } from "../options/promptUtils";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

function prompt(id: string, title: string, command: string): Prompt {
  const now = "2026-01-01T00:00:00.000Z";
  return {
    id,
    title,
    command,
    aliases: [],
    tags: [],
    description: "",
    body: `${title} body`,
    defaultVersionId: "v1",
    versions: [
      {
        id: "v1",
        promptId: id,
        label: "Original",
        content: `${title} body`,
        changelog: "Created prompt",
        createdAt: now,
        createdBy: "local user",
        isDefault: true
      },
      {
        id: "v2",
        promptId: id,
        label: "Second",
        content: `${title} updated body`,
        changelog: "Updated prompt",
        createdAt: now,
        createdBy: "local user",
        isDefault: false
      }
    ],
    variants: [],
    variables: {},
    createdAt: now,
    updatedAt: now,
    usageCount: 0
  };
}

async function flushPromises(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
}

type RuntimeTestMessage = { type: string; prompt?: Prompt };
type RuntimeTestResponse = { ok: boolean; data?: unknown };

function installChromeMock(
  getPrompts: () => Prompt[],
  getSettings: () => PromptDeckSettings = () => defaultSettings,
  handleRuntimeMessage?: (message: RuntimeTestMessage) => RuntimeTestResponse | undefined
) {
  const storageListeners = new Set<(changes: Record<string, chrome.storage.StorageChange>, areaName: string) => void>();
  const sendMessage = vi.fn((message: RuntimeTestMessage, callback: (response: RuntimeTestResponse) => void) => {
    const handled = handleRuntimeMessage?.(message);
    if (handled) callback(handled);
    else if (message.type === "PROMPTS_LIST") callback({ ok: true, data: getPrompts() });
    else if (message.type === "SETTINGS_GET") callback({ ok: true, data: getSettings() });
    else if (message.type === "PROMPTS_SAVE" && message.prompt) callback({ ok: true, data: message.prompt });
    else callback({ ok: true });
  });

  vi.stubGlobal("chrome", {
    runtime: {
      sendMessage,
      lastError: undefined
    },
    storage: {
      local: {
        get: vi.fn(),
        set: vi.fn(),
        remove: vi.fn()
      },
      onChanged: {
        addListener: vi.fn((listener: (changes: Record<string, chrome.storage.StorageChange>, areaName: string) => void) => {
          storageListeners.add(listener);
        }),
        removeListener: vi.fn((listener: (changes: Record<string, chrome.storage.StorageChange>, areaName: string) => void) => {
          storageListeners.delete(listener);
        })
      }
    }
  });

  return {
    sendMessage,
    emitStorageChange(changes: Record<string, chrome.storage.StorageChange>, areaName = "local") {
      storageListeners.forEach((listener) => listener(changes, areaName));
    }
  };
}

describe("options manager", () => {
  let container: HTMLDivElement;
  let root: Root | undefined;

  beforeEach(() => {
    container = document.createElement("div");
    document.body.append(container);
    Object.defineProperty(window, "matchMedia", {
      configurable: true,
      value: vi.fn().mockImplementation((query: string) => ({
        matches: false,
        media: query,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn()
      }))
    });
  });

  afterEach(async () => {
    if (root) {
      await act(async () => root?.unmount());
      root = undefined;
    }
    document.body.innerHTML = "";
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("exports and composes split manager modules", async () => {
    const item = prompt("paper", "Paper Prompt", "/paper");
    root = createRoot(container);

    await act(async () => {
      root?.render(
        <AppShell
          theme="light"
          sidebar={
            <Sidebar
              prompts={[item]}
              results={searchPrompts([item], "")}
              selected={item}
              query=""
              settings={defaultSettings}
              status=""
              onQuery={vi.fn()}
              onSelect={vi.fn()}
              onCreate={vi.fn()}
              onSettings={vi.fn()}
              onExportBackup={vi.fn()}
              onExportMarkdown={vi.fn()}
              onImport={vi.fn()}
              onDeleteAll={vi.fn()}
            />
          }
          rail={<VersionRail prompt={item} onDraftChange={vi.fn()} />}
        >
          <PromptEditor prompt={item} status="" onSave={vi.fn().mockResolvedValue(undefined)} onDelete={vi.fn().mockResolvedValue(undefined)} />
        </AppShell>
      );
    });

    expect(container.textContent).toContain("PromptDeck");
    expect(container.textContent).toContain("Paper Prompt");
    expect(container.textContent).toContain("Versions");
    expect(container.querySelector("[aria-label='Version diff']")).toBeTruthy();
  });

  it("reloads through runtime messages when storage invalidation signals change", async () => {
    vi.useFakeTimers();
    let prompts = [prompt("paper", "Paper Prompt", "/paper")];
    const chromeMock = installChromeMock(() => prompts);
    root = createRoot(container);

    await act(async () => {
      root?.render(<App />);
      await flushPromises();
    });

    expect(chromeMock.sendMessage).toHaveBeenCalledTimes(2);
    expect(container.textContent).toContain("Paper Prompt");

    prompts = [prompt("summary", "Summary Prompt", "/summary")];
    chromeMock.emitStorageChange({
      [PROMPTDECK_STATE_KEY]: { oldValue: undefined, newValue: { reason: "prompts" } } as chrome.storage.StorageChange,
      [SETTINGS_KEY]: { oldValue: undefined, newValue: defaultSettings } as chrome.storage.StorageChange
    });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(100);
      await flushPromises();
    });

    expect(chromeMock.sendMessage).toHaveBeenCalledTimes(4);
    expect(container.textContent).toContain("Summary Prompt");
  });

  it("creates prompts from the latest runtime list and clears active search", async () => {
    let prompts = [prompt("paper", "Paper Prompt", "/paper")];
    const savedCommands: string[] = [];
    installChromeMock(
      () => prompts,
      () => defaultSettings,
      (message) => {
        if (message.type !== "PROMPTS_SAVE" || !message.prompt) return undefined;
        savedCommands.push(message.prompt.command);
        prompts = [message.prompt, ...prompts];
        return { ok: true, data: message.prompt };
      }
    );
    root = createRoot(container);

    await act(async () => {
      root?.render(<App />);
      await flushPromises();
    });

    const searchInput = container.querySelector<HTMLInputElement>("[aria-label='Search prompts']");
    expect(searchInput).toBeTruthy();

    await act(async () => {
      searchInput!.value = "paper";
      searchInput!.dispatchEvent(new Event("input", { bubbles: true }));
    });

    prompts = [createPromptFromCommand("/new-prompt"), ...prompts];

    await act(async () => {
      container.querySelector<HTMLButtonElement>("[aria-label='New prompt']")?.click();
      await flushPromises();
    });

    expect(savedCommands).toEqual(["/new-prompt-2"]);
    expect(searchInput!.value).toBe("");
    expect(container.textContent).toContain("New Prompt 2");
  });

  it("does not reuse the id of a renamed blank prompt when creating another prompt", async () => {
    const renamedBlankPrompt = prompt("new-prompt", "Renamed Prompt", "/renamed");
    expect(nextBlankPromptCommand([renamedBlankPrompt])).toBe("/new-prompt-2");

    let prompts = [renamedBlankPrompt];
    const savedCommands: string[] = [];
    installChromeMock(
      () => prompts,
      () => defaultSettings,
      (message) => {
        if (message.type !== "PROMPTS_SAVE" || !message.prompt) return undefined;
        savedCommands.push(message.prompt.command);
        prompts = [message.prompt, ...prompts];
        return { ok: true, data: message.prompt };
      }
    );
    root = createRoot(container);

    await act(async () => {
      root?.render(<App />);
      await flushPromises();
    });

    await act(async () => {
      container.querySelector<HTMLButtonElement>("[aria-label='New prompt']")?.click();
      await flushPromises();
    });

    expect(savedCommands).toEqual(["/new-prompt-2"]);
    expect(prompts.map((item) => item.id)).toEqual(["new-prompt-2", "new-prompt"]);
    expect(container.textContent).toContain("Renamed Prompt");
    expect(container.textContent).toContain("New Prompt 2");
  });
});
