import { afterEach, describe, expect, it, vi } from "vitest";
import { sendRuntimeMessage } from "../shared/runtime/sendMessage";

describe("sendRuntimeMessage", () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  function installRuntimeMock(
    sendMessage: (message: unknown, callback: (response?: unknown) => void) => void,
    getLastError: () => chrome.runtime.LastError | undefined
  ): void {
    vi.stubGlobal("chrome", {
      runtime: {
        sendMessage: vi.fn(sendMessage),
        get lastError() {
          return getLastError();
        }
      }
    });
  }

  it("retries one transient runtime error and returns the second response", async () => {
    vi.useFakeTimers();
    let lastError: chrome.runtime.LastError | undefined;

    installRuntimeMock(
      (_message, callback) => {
        if (vi.mocked(chrome.runtime.sendMessage).mock.calls.length === 1) {
          lastError = { message: "The message port closed before a response was received." };
          callback();
          lastError = undefined;
          return;
        }
        callback({ ok: true, data: "loaded" });
      },
      () => lastError
    );

    const result = sendRuntimeMessage<string>({ type: "PROMPTS_LIST" });
    await vi.advanceTimersByTimeAsync(50);

    await expect(result).resolves.toBe("loaded");
    expect(chrome.runtime.sendMessage).toHaveBeenCalledTimes(2);
  });

  it("retries a transient runtime error once and propagates the retry failure", async () => {
    vi.useFakeTimers();
    let lastError: chrome.runtime.LastError | undefined;

    installRuntimeMock(
      (_message, callback) => {
        lastError = { message: "Could not establish connection. Receiving end does not exist." };
        callback();
        lastError = undefined;
      },
      () => lastError
    );

    const result = sendRuntimeMessage<string>({ type: "PROMPTS_LIST" });
    const assertion = expect(result).rejects.toThrow("Could not establish connection. Receiving end does not exist.");
    await vi.advanceTimersByTimeAsync(50);

    await assertion;
    expect(chrome.runtime.sendMessage).toHaveBeenCalledTimes(2);
  });

  it("does not retry handler errors returned by the background", async () => {
    installRuntimeMock((_message, callback) => callback({ ok: false, error: "Prompt was not found." }), () => undefined);

    await expect(sendRuntimeMessage<string>({ type: "PROMPTS_LIST" })).rejects.toThrow("Prompt was not found.");
    expect(chrome.runtime.sendMessage).toHaveBeenCalledTimes(1);
  });
});
