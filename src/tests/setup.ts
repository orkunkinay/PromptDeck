import { vi } from "vitest";

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
