import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PaletteController } from "../content/index";
import type { Prompt, PromptDeckSettings } from "../shared/models/prompt";
import { SETTINGS_KEY } from "../shared/settings/settingsService";
import { defaultSettings } from "../shared/settings/defaultSettings";
import { PROMPTDECK_STATE_KEY } from "../shared/state/stateInvalidation";

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
      }
    ],
    variants: [],
    variables: {},
    createdAt: now,
    updatedAt: now,
    usageCount: 0
  };
}

function installChromeMock(prompts: Prompt[], settings: PromptDeckSettings = defaultSettings) {
  const storageListeners = new Set<(changes: Record<string, chrome.storage.StorageChange>, areaName: string) => void>();
  const sendMessage = vi.fn((message: { type: string }, callback: (response: { ok: boolean; data?: unknown }) => void) => {
    if (message.type === "PROMPTS_LIST") callback({ ok: true, data: prompts });
    else if (message.type === "SETTINGS_GET") callback({ ok: true, data: settings });
    else callback({ ok: true });
  });
  const addStorageListener = vi.fn((listener: (changes: Record<string, chrome.storage.StorageChange>, areaName: string) => void) => {
    storageListeners.add(listener);
  });
  const removeStorageListener = vi.fn((listener: (changes: Record<string, chrome.storage.StorageChange>, areaName: string) => void) => {
    storageListeners.delete(listener);
  });

  vi.stubGlobal("chrome", {
    runtime: {
      sendMessage,
      onMessage: { addListener: vi.fn(), removeListener: vi.fn() },
      openOptionsPage: vi.fn(),
      lastError: undefined
    },
    storage: {
      local: {
        get: vi.fn(),
        set: vi.fn(),
        remove: vi.fn()
      },
      onChanged: {
        addListener: addStorageListener,
        removeListener: removeStorageListener
      }
    },
    commands: {
      onCommand: { addListener: vi.fn() }
    }
  });

  return {
    sendMessage,
    addStorageListener,
    emitStorageChange(changes: Record<string, chrome.storage.StorageChange>, areaName = "local") {
      storageListeners.forEach((listener) => listener(changes, areaName));
    }
  };
}

async function flushPromises(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
}

function openPalette(value = ";;paper"): HTMLTextAreaElement {
  const textarea = document.createElement("textarea");
  textarea.value = value;
  document.body.append(textarea);
  textarea.focus();
  textarea.setSelectionRange(value.length, value.length);
  textarea.dispatchEvent(new InputEvent("input", { bubbles: true, inputType: "insertText", data: value }));
  return textarea;
}

describe("PaletteController", () => {
  let controller: PaletteController | undefined;

  beforeEach(() => {
    document.body.innerHTML = "";
  });

  afterEach(() => {
    controller?.stop();
    controller = undefined;
    document.body.innerHTML = "";
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("creates an open shadow root and keeps palette nodes inside it", async () => {
    installChromeMock([prompt("paper", "Paper Prompt", "/paper")]);
    document.head.append(
      Object.assign(document.createElement("style"), {
        textContent: "* { all: revert; } div { color: red; z-index: 1 !important; }"
      })
    );
    controller = new PaletteController();
    controller.start();
    await flushPromises();

    openPalette();
    const host = document.getElementById("promptdeck-root") as HTMLDivElement;

    expect(host).toBeTruthy();
    expect(host.shadowRoot).toBeInstanceOf(ShadowRoot);
    expect(host.querySelector(".pd-root")).toBeNull();
    expect(host.shadowRoot?.querySelector("style")?.textContent).toContain(".pd-root");
    expect(host.shadowRoot?.querySelector(".pd-root")).toBeTruthy();
    expect(host.shadowRoot?.querySelector(".pd-pill")).toBeTruthy();
  });

  it("updates palette text in place without replacing the root node", async () => {
    installChromeMock([prompt("paper", "Paper Prompt", "/paper"), prompt("summary", "Summary Prompt", "/summary")]);
    controller = new PaletteController();
    controller.start();
    await flushPromises();

    const textarea = openPalette(";;p");
    const root = document.getElementById("promptdeck-root")?.shadowRoot?.querySelector(".pd-root") as HTMLDivElement;
    expect(root.hidden).toBe(false);
    expect(root.querySelector(".pd-title")?.textContent).toBe("Paper Prompt");

    textarea.value = ";;summary";
    textarea.setSelectionRange(textarea.value.length, textarea.value.length);
    textarea.dispatchEvent(new InputEvent("input", { bubbles: true, inputType: "insertText", data: "summary" }));

    expect(document.getElementById("promptdeck-root")?.shadowRoot?.querySelector(".pd-root")).toBe(root);
    expect(root.querySelector(".pd-title")?.textContent).toBe("Summary Prompt");
  });

  it("refreshes from storage changes instead of focusin", async () => {
    vi.useFakeTimers();
    const chromeMock = installChromeMock([prompt("paper", "Paper Prompt", "/paper")]);
    controller = new PaletteController();
    controller.start();
    await flushPromises();
    expect(chromeMock.sendMessage).toHaveBeenCalledTimes(2);

    const first = document.createElement("input");
    const second = document.createElement("input");
    document.body.append(first, second);
    first.dispatchEvent(new FocusEvent("focusin", { bubbles: true }));
    second.dispatchEvent(new FocusEvent("focusin", { bubbles: true }));
    expect(chromeMock.sendMessage).toHaveBeenCalledTimes(2);

    chromeMock.emitStorageChange({
      [PROMPTDECK_STATE_KEY]: { oldValue: undefined, newValue: { reason: "prompts" } } as chrome.storage.StorageChange
    });
    await vi.advanceTimersByTimeAsync(100);
    await flushPromises();
    expect(chromeMock.sendMessage).toHaveBeenCalledTimes(4);

    chromeMock.emitStorageChange({
      [SETTINGS_KEY]: { oldValue: undefined, newValue: defaultSettings } as chrome.storage.StorageChange
    });
    await vi.advanceTimersByTimeAsync(100);
    await flushPromises();
    expect(chromeMock.sendMessage).toHaveBeenCalledTimes(6);
  });

  it("does not dismiss or steal focus when clicking inside the shadowed palette", async () => {
    installChromeMock([prompt("paper", "Paper Prompt", "/paper"), prompt("plan", "Plan Prompt", "/plan")]);
    controller = new PaletteController();
    controller.start();
    await flushPromises();

    const textarea = openPalette(";;p");
    const root = document.getElementById("promptdeck-root")?.shadowRoot?.querySelector(".pd-root") as HTMLDivElement;
    const button = root.querySelector(".pd-pill-main") as HTMLButtonElement;

    expect(root.hidden).toBe(false);
    expect(document.activeElement).toBe(textarea);
    const mousedownWasNotCanceled = button.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, composed: true, cancelable: true }));
    button.dispatchEvent(new MouseEvent("click", { bubbles: true, composed: true }));

    expect(mousedownWasNotCanceled).toBe(false);
    expect(root.hidden).toBe(false);
    expect(root.querySelector(".pd-menu")?.hasAttribute("hidden")).toBe(false);
    expect(document.activeElement).toBe(textarea);
  });

  it("exposes palette listbox, option, ask-control, and reduced-motion attributes", async () => {
    installChromeMock([prompt("paper", "Paper Prompt", "/paper"), prompt("plan", "Plan Prompt", "/plan")], {
      ...defaultSettings,
      insertionMode: "ask"
    });
    controller = new PaletteController();
    controller.start();
    await flushPromises();

    openPalette(";;p");
    const root = document.getElementById("promptdeck-root")?.shadowRoot?.querySelector(".pd-root") as HTMLDivElement;
    const main = root.querySelector(".pd-pill-main") as HTMLButtonElement;
    main.dispatchEvent(new MouseEvent("click", { bubbles: true, composed: true }));

    const menu = root.querySelector(".pd-menu") as HTMLDivElement;
    const activeOption = root.querySelector("#promptdeck-option-0") as HTMLButtonElement;
    const ask = root.querySelector(".pd-ask") as HTMLSpanElement;

    const shadowRoot = root.getRootNode() as ShadowRoot;
    expect(shadowRoot).toBeInstanceOf(ShadowRoot);
    expect(shadowRoot.querySelector("style")?.textContent).toContain("prefers-reduced-motion");
    expect(main.getAttribute("aria-haspopup")).toBe("listbox");
    expect(main.getAttribute("aria-expanded")).toBe("true");
    expect(menu.getAttribute("role")).toBe("listbox");
    expect(menu.getAttribute("aria-activedescendant")).toBe("promptdeck-option-0");
    expect(activeOption.getAttribute("role")).toBe("option");
    expect(activeOption.getAttribute("aria-selected")).toBe("true");
    expect(activeOption.getAttribute("aria-label")).toContain("Paper Prompt");
    expect(ask.getAttribute("role")).toBe("group");
    expect(ask.getAttribute("aria-label")).toBe("Choose how to use this prompt");
    expect(root.querySelector("[aria-label='Insert selected prompt']")).toBeTruthy();
    expect(root.querySelector("[aria-label='Copy selected prompt']")).toBeTruthy();
  });
});
