import type { RuntimeMessage, RuntimeResponse } from "../models/messages";

const RETRY_BACKOFF_MS = 50;

function isTransientRuntimeError(message: string | undefined): boolean {
  return Boolean(message?.match(/message port closed|receiving end does not exist|extension context invalidated/i));
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => globalThis.setTimeout(resolve, ms));
}

export function sendRuntimeMessage<T>(message: RuntimeMessage): Promise<T> {
  const send = (attempt: number): Promise<T> =>
    new Promise((resolve, reject) => {
      chrome.runtime.sendMessage(message, (response: RuntimeResponse<T>) => {
        const lastError = chrome.runtime.lastError;
        if (lastError) {
          const errorMessage = lastError.message || "Runtime request failed.";
          if (attempt === 0 && isTransientRuntimeError(errorMessage)) {
            void delay(RETRY_BACKOFF_MS)
              .then(() => send(1))
              .then(resolve, reject);
            return;
          }
          reject(new Error(errorMessage));
          return;
        }
        if (!response?.ok) {
          reject(new Error(response?.error || "Runtime request failed."));
          return;
        }
        resolve(response.data as T);
      });
    });

  if (typeof chrome === "undefined" || !chrome.runtime?.sendMessage) {
    return Promise.reject(new Error("Extension runtime is unavailable."));
  }

  return send(0);
}
