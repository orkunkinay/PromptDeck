import { existsSync, readdirSync, rmSync, statSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { join, relative, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const dist = join(root, "dist");
const zipPath = join(root, "promptdeck-chrome-extension.zip");

function walk(directory, visitor) {
  for (const entry of readdirSync(directory)) {
    const path = join(directory, entry);
    const stats = statSync(path);
    if (stats.isDirectory()) {
      walk(path, visitor);
      continue;
    }
    visitor(path);
  }
}

function removeIfExists(path) {
  if (existsSync(path)) rmSync(path, { force: true });
}

function assertFile(path) {
  if (!existsSync(path)) {
    throw new Error(`Missing required package file: ${relative(root, path)}`);
  }
}

if (!existsSync(dist)) {
  throw new Error("Missing dist/. Run npm run build before packaging.");
}

walk(dist, (path) => {
  if (path.endsWith(".map") || path.endsWith(".DS_Store")) removeIfExists(path);
});

removeIfExists(join(dist, "icons", "icon-1.png"));
removeIfExists(join(dist, "autocomplete_helper.png"));
removeIfExists(join(dist, "manager_ui.png"));
removeIfExists(join(dist, "promptdeck.mov"));

const manifest = JSON.parse(await readFile(join(dist, "manifest.json"), "utf8"));
if (manifest.manifest_version !== 3) throw new Error("manifest.json must use Manifest V3.");

[
  "manifest.json",
  "background/index.js",
  "content/index.js",
  "src/popup/index.html",
  "src/options/index.html",
  "logo.png",
  "icons/icon-16.png",
  "icons/icon-32.png",
  "icons/icon-48.png",
  "icons/icon-128.png"
].forEach((file) => assertFile(join(dist, file)));

removeIfExists(zipPath);

const result = spawnSync("zip", ["-r", zipPath, "."], {
  cwd: dist,
  encoding: "utf8",
  stdio: "pipe"
});

if (result.status !== 0) {
  throw new Error(`zip failed: ${result.stderr || result.stdout || "unknown error"}`);
}

console.log(`Created ${relative(root, zipPath)} from ${relative(root, dist)}/`);
