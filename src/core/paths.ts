import os from "node:os";
import path from "node:path";

/**
 * Platform-neutral resolution of the PromptDeck local data directory and
 * library file. The browser extension keeps its data in IndexedDB; external
 * surfaces (CLI, editors) use a predictable local-first JSON file instead.
 *
 * Resolution order:
 *   1. `PROMPTDECK_LIBRARY` — explicit path to the library file (wins outright).
 *   2. `<dataDir>/library.json` where `dataDir` is:
 *        - `PROMPTDECK_HOME` if set, else
 *        - `$XDG_DATA_HOME/promptdeck` if `XDG_DATA_HOME` is set, else
 *        - `%APPDATA%/PromptDeck` on Windows, else
 *        - `~/.promptdeck`.
 */

export const LIBRARY_FILE_NAME = "library.json";

export interface PathEnv {
  PROMPTDECK_LIBRARY?: string;
  PROMPTDECK_HOME?: string;
  XDG_DATA_HOME?: string;
  APPDATA?: string;
}

function readEnv(env: PathEnv | NodeJS.ProcessEnv): PathEnv {
  return {
    PROMPTDECK_LIBRARY: env.PROMPTDECK_LIBRARY || undefined,
    PROMPTDECK_HOME: env.PROMPTDECK_HOME || undefined,
    XDG_DATA_HOME: env.XDG_DATA_HOME || undefined,
    APPDATA: env.APPDATA || undefined
  };
}

export function resolveDataDir(env: PathEnv | NodeJS.ProcessEnv = process.env, platform = process.platform): string {
  const resolved = readEnv(env);
  if (resolved.PROMPTDECK_HOME) return path.resolve(resolved.PROMPTDECK_HOME);
  if (resolved.XDG_DATA_HOME) return path.join(path.resolve(resolved.XDG_DATA_HOME), "promptdeck");
  if (platform === "win32" && resolved.APPDATA) return path.join(path.resolve(resolved.APPDATA), "PromptDeck");
  return path.join(os.homedir(), ".promptdeck");
}

export function resolveLibraryPath(
  env: PathEnv | NodeJS.ProcessEnv = process.env,
  platform = process.platform
): string {
  const resolved = readEnv(env);
  if (resolved.PROMPTDECK_LIBRARY) return path.resolve(resolved.PROMPTDECK_LIBRARY);
  return path.join(resolveDataDir(env, platform), LIBRARY_FILE_NAME);
}
