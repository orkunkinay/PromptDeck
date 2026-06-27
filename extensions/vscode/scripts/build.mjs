import { build, context } from "esbuild";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const watch = process.argv.includes("--watch");

const extensionOptions = {
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

const webviewOptions = {
  entryPoints: [resolve(root, "src/webview/main.tsx")],
  outfile: resolve(root, "dist/webview/manager.js"),
  bundle: true,
  platform: "browser",
  format: "iife",
  target: "es2020",
  sourcemap: true,
  logLevel: "info",
  define: {
    "process.env.NODE_ENV": JSON.stringify(watch ? "development" : "production")
  }
};

if (watch) {
  const extensionContext = await context(extensionOptions);
  const webviewContext = await context(webviewOptions);
  await Promise.all([extensionContext.watch(), webviewContext.watch()]);
  console.log("Watching VS Code extension...");
} else {
  await Promise.all([build(extensionOptions), build(webviewOptions)]);
  console.log("Built VS Code extension -> dist/extension.js and dist/webview/manager.js");
}
