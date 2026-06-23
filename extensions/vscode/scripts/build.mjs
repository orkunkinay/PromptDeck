import { build, context } from "esbuild";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const watch = process.argv.includes("--watch");

const options = {
  entryPoints: [resolve(root, "src/extension.ts")],
  outfile: resolve(root, "dist/extension.js"),
  bundle: true,
  platform: "node",
  format: "cjs",
  target: "node18",
  // `vscode` is provided by the editor at runtime and must not be bundled.
  external: ["vscode"],
  sourcemap: true,
  logLevel: "info"
};

if (watch) {
  const ctx = await context(options);
  await ctx.watch();
  console.log("Watching VS Code extension...");
} else {
  await build(options);
  console.log("Built VS Code extension -> dist/extension.js");
}
