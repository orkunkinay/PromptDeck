import { build } from "esbuild";
import { chmodSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const outfile = resolve(root, "bin/promptdeck.mjs");

mkdirSync(dirname(outfile), { recursive: true });

await build({
  entryPoints: [resolve(root, "src/cli/index.ts")],
  outfile,
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node20",
  // Node builtins are externalized automatically for platform:node.
  banner: { js: "#!/usr/bin/env node" },
  logLevel: "info"
});

chmodSync(outfile, 0o755);
console.log(`Built CLI -> ${outfile}`);
