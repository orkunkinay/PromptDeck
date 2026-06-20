import { vi } from "vitest";

if (!("indexedDB" in globalThis)) {
  try {
    const fakeIndexedDbAuto = "fake-indexeddb/auto";
    await import(/* @vite-ignore */ fakeIndexedDbAuto);
  } catch {
    // Storage tests are skipped when the optional fake IndexedDB test harness is unavailable.
  }
}

Object.defineProperty(globalThis.navigator, "clipboard", {
  value: {
    writeText: vi.fn().mockResolvedValue(undefined)
  },
  configurable: true
});

if (!("chrome" in globalThis)) {
  vi.stubGlobal("chrome", {
    runtime: {
      sendMessage: vi.fn(),
      onMessage: { addListener: vi.fn() },
      onInstalled: { addListener: vi.fn() },
      openOptionsPage: vi.fn()
    },
    storage: {
      local: {
        get: vi.fn(),
        set: vi.fn(),
        remove: vi.fn()
      }
    },
    commands: {
      onCommand: { addListener: vi.fn() }
    }
  });
}
