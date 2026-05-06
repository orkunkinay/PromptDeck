import type { RuntimeMessage, RuntimeResponse } from "../models/messages";

export function sendRuntimeMessage<T>(message: RuntimeMessage): Promise<T> {
  return new Promise((resolve, reject) => {
    if (typeof chrome === "undefined" || !chrome.runtime?.sendMessage) {
      reject(new Error("Extension runtime is unavailable."));
      return;
    }
    chrome.runtime.sendMessage(message, (response: RuntimeResponse<T>) => {
      const lastError = chrome.runtime.lastError;
      if (lastError) {
        reject(new Error(lastError.message));
        return;
      }
      if (!response?.ok) {
        reject(new Error(response?.error || "Runtime request failed."));
        return;
      }
      resolve(response.data as T);
    });
  });
}
