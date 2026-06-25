export interface ParsedArgs {
  positionals: string[];
  flags: Record<string, string | boolean>;
  /** Values for repeatable flags (e.g. `--var a=1 --var b=2`). */
  lists: Record<string, string[]>;
}

export interface ParseOptions {
  /** Flags that never take a value. */
  booleans?: string[];
  /** Flags that may be repeated; collected into `lists` instead of `flags`. */
  arrays?: string[];
}

/**
 * Minimal dependency-free argv parser. Supports `--flag`, `--flag value`,
 * `--flag=value`, repeatable array flags, and short `-h`. Everything else is a
 * positional.
 */
export function parseArgs(argv: string[], options: ParseOptions | string[] = {}): ParsedArgs {
  const normalized: ParseOptions = Array.isArray(options) ? { booleans: options } : options;
  const booleans = new Set(normalized.booleans || []);
  const arrays = new Set(normalized.arrays || []);
  const positionals: string[] = [];
  const flags: Record<string, string | boolean> = {};
  const lists: Record<string, string[]> = {};

  const pushList = (key: string, value: string) => {
    (lists[key] ||= []).push(value);
  };

  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (token === "--") {
      positionals.push(...argv.slice(i + 1));
      break;
    }
    if (token.startsWith("--")) {
      const body = token.slice(2);
      const eq = body.indexOf("=");
      const key = eq === -1 ? body : body.slice(0, eq);
      if (eq !== -1) {
        const value = body.slice(eq + 1);
        if (arrays.has(key)) pushList(key, value);
        else flags[key] = value;
        continue;
      }
      if (booleans.has(key)) {
        flags[key] = true;
        continue;
      }
      const next = argv[i + 1];
      // Accept a lone "-" (stdin/stdout convention) as a value, but otherwise
      // treat a following dash-flag as "this flag is a boolean".
      if (next !== undefined && (next === "-" || !next.startsWith("-"))) {
        if (arrays.has(key)) pushList(key, next);
        else flags[key] = next;
        i += 1;
      } else {
        flags[key] = true;
      }
      continue;
    }
    if (token === "-h" || token === "-e") {
      flags[token === "-h" ? "help" : "edit"] = true;
      continue;
    }
    positionals.push(token);
  }

  return { positionals, flags, lists };
}

export function flagString(flags: Record<string, string | boolean>, key: string): string | undefined {
  const value = flags[key];
  return typeof value === "string" ? value : undefined;
}

export function flagBool(flags: Record<string, string | boolean>, key: string): boolean {
  return flags[key] === true || flags[key] === "true";
}
