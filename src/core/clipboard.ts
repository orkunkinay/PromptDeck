import { spawnSync } from "node:child_process";

export interface ClipboardCommand {
  command: string;
  args: string[];
}

/**
 * Pick a clipboard write command for the current platform using only tools that
 * ship with the OS or are commonly available, so no native dependency is
 * required. Returns null when no usable tool is found.
 */
export function clipboardCommand(platform = process.platform, env: NodeJS.ProcessEnv = process.env): ClipboardCommand | null {
  if (platform === "darwin") {
    return { command: "pbcopy", args: [] };
  }
  if (platform === "win32") {
    return { command: "clip", args: [] };
  }
  // Linux / others: prefer Wayland, then X11 helpers.
  if (env.WAYLAND_DISPLAY && commandExists("wl-copy")) {
    return { command: "wl-copy", args: [] };
  }
  if (commandExists("xclip")) {
    return { command: "xclip", args: ["-selection", "clipboard"] };
  }
  if (commandExists("xsel")) {
    return { command: "xsel", args: ["--clipboard", "--input"] };
  }
  if (commandExists("wl-copy")) {
    return { command: "wl-copy", args: [] };
  }
  return null;
}

function commandExists(command: string): boolean {
  const probe = process.platform === "win32" ? "where" : "which";
  const result = spawnSync(probe, [command], { stdio: "ignore" });
  return result.status === 0;
}

export interface ClipboardResult {
  ok: boolean;
  reason?: string;
}

/** Write text to the system clipboard. Returns a result rather than throwing. */
export function copyToClipboard(text: string, platform = process.platform, env: NodeJS.ProcessEnv = process.env): ClipboardResult {
  const command = clipboardCommand(platform, env);
  if (!command) {
    return {
      ok: false,
      reason:
        platform === "linux"
          ? "No clipboard tool found. Install wl-clipboard (Wayland) or xclip/xsel (X11), or use `print`."
          : "No clipboard tool available on this platform. Use `print` to write to stdout instead."
    };
  }
  const result = spawnSync(command.command, command.args, { input: text });
  if (result.error || result.status !== 0) {
    return { ok: false, reason: result.error ? result.error.message : `${command.command} exited with code ${result.status}.` };
  }
  return { ok: true };
}

export function clipboardAvailable(platform = process.platform, env: NodeJS.ProcessEnv = process.env): boolean {
  return clipboardCommand(platform, env) !== null;
}
