import * as readline from "node:readline";
import type { PromptLibrary } from "../core/library";
import { createDefaultIO, run } from "./run";

/**
 * Terminal picker: type to filter, Up/Down to move, Enter to select, Esc to
 * cancel. Returns the selected prompt command (with default content) so the
 * caller can copy it. Kept out of run.ts so the core CLI stays non-interactive
 * and testable.
 */
async function interactivePick(library: PromptLibrary): Promise<string | undefined> {
  if (!process.stdin.isTTY) {
    process.stderr.write("Interactive pick needs an interactive terminal.\n");
    return undefined;
  }

  return new Promise<string | undefined>((resolve) => {
    let query = "";
    let index = 0;

    const render = () => {
      const results = library.search(query).slice(0, 10);
      index = Math.max(0, Math.min(index, results.length - 1));
      readline.cursorTo(process.stdout, 0, 0);
      readline.clearScreenDown(process.stdout);
      process.stdout.write(`PromptDeck pick — type to filter, ↑/↓ move, Enter copy, Esc cancel\n\n`);
      process.stdout.write(`> ${query}\n\n`);
      if (results.length === 0) {
        process.stdout.write("  (no matches)\n");
      } else {
        results.forEach((result, i) => {
          const marker = i === index ? "›" : " ";
          process.stdout.write(`${marker} ${result.prompt.command}  —  ${result.prompt.title}\n`);
        });
      }
      return results;
    };

    let results = render();

    const stdin = process.stdin;
    readline.emitKeypressEvents(stdin);
    if (stdin.isTTY) stdin.setRawMode(true);

    const cleanup = () => {
      if (stdin.isTTY) stdin.setRawMode(false);
      stdin.removeListener("keypress", onKey);
      stdin.pause();
      readline.cursorTo(process.stdout, 0);
      readline.clearScreenDown(process.stdout);
    };

    const onKey = (str: string | undefined, key: readline.Key) => {
      if (key.name === "escape" || (key.ctrl && key.name === "c")) {
        cleanup();
        resolve(undefined);
        return;
      }
      if (key.name === "return") {
        const selected = results[index];
        cleanup();
        resolve(selected ? selected.prompt.command : undefined);
        return;
      }
      if (key.name === "up") {
        index -= 1;
      } else if (key.name === "down") {
        index += 1;
      } else if (key.name === "backspace") {
        query = query.slice(0, -1);
        index = 0;
      } else if (str && !key.ctrl && !key.meta && str.length === 1 && str >= " ") {
        query += str;
        index = 0;
      }
      results = render();
    };

    stdin.on("keypress", onKey);
  });
}

run(process.argv.slice(2), createDefaultIO({ interactivePick }))
  .then((code) => {
    process.exitCode = code;
  })
  .catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  });
