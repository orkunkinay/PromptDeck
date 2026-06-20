import { existsSync, readdirSync, rmSync, statSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { extname, join, relative, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const dist = join(root, "dist");
const zipPath = join(root, "promptdeck-chrome-extension.zip");
const validateOnly = process.argv.includes("--validate-only");
const allowedPermissions = ["storage", "clipboardWrite"];
const textPackageExtensions = new Set([".css", ".html", ".js", ".json", ".mjs", ".txt"]);
const remoteScriptPatterns = [
  /<script\b[^>]*\bsrc\s*=\s*["']https?:\/\//i,
  /\bimportScripts\s*\([^)]*["']https?:\/\//i,
  /\bimport\s*\(\s*["']https?:\/\//i,
  /["']https?:\/\/[^"'`<>\\)]+\.m?js(?:[?#][^"'`<>\\)]*)?["']/i
];

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

function assertExactPermissions(manifest, source) {
  const permissions = manifest.permissions;
  if (!Array.isArray(permissions) || JSON.stringify(permissions) !== JSON.stringify(allowedPermissions)) {
    throw new Error(`${source} permissions must be exactly ${JSON.stringify(allowedPermissions)}.`);
  }

  for (const key of ["host_permissions", "optional_permissions", "optional_host_permissions"]) {
    const value = manifest[key];
    if (Array.isArray(value) && value.length > 0) {
      throw new Error(`${source} must not declare ${key}.`);
    }
  }
}

function assertNoRemoteScriptUrls(text, source) {
  for (const pattern of remoteScriptPatterns) {
    const match = text.match(pattern);
    if (match) {
      throw new Error(`${source} references hosted script URL ${match[0]}. Extension packages must not reference remote scripts.`);
    }
  }
}

function isTextPackageFile(path) {
  return textPackageExtensions.has(extname(path).toLowerCase());
}

async function validateManifestFile(path, source) {
  const manifestText = await readFile(path, "utf8");
  const manifest = JSON.parse(manifestText);
  if (manifest.manifest_version !== 3) throw new Error(`${source} must use Manifest V3.`);
  assertExactPermissions(manifest, source);
  assertNoRemoteScriptUrls(manifestText, source);
  return manifest;
}

async function validateDistPackage() {
  const manifest = await validateManifestFile(join(dist, "manifest.json"), "dist/manifest.json");
  const textFiles = [];
  walk(dist, (path) => {
    if (isTextPackageFile(path)) textFiles.push(path);
  });
  for (const path of textFiles) {
    const text = await readFile(path, "utf8");
    assertNoRemoteScriptUrls(text, relative(root, path));
  }
  return manifest;
}

function unzip(args) {
  const result = spawnSync("unzip", args, { encoding: "utf8", stdio: "pipe" });
  if (result.status !== 0) {
    throw new Error(`unzip failed: ${result.stderr || result.stdout || "unknown error"}`);
  }
  return result.stdout;
}

function validateZipManifest(manifestText) {
  const manifest = JSON.parse(manifestText);
  if (manifest.manifest_version !== 3) throw new Error("zip manifest.json must use Manifest V3.");
  assertExactPermissions(manifest, "zip manifest.json");
  assertNoRemoteScriptUrls(manifestText, "zip manifest.json");
}

function validateZipPackage() {
  validateZipManifest(unzip(["-p", zipPath, "manifest.json"]));
  const entries = unzip(["-Z1", zipPath])
    .split("\n")
    .filter(Boolean)
    .filter(isTextPackageFile);

  for (const entry of entries) {
    const text = unzip(["-p", zipPath, entry]);
    assertNoRemoteScriptUrls(text, `zip ${entry}`);
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

await validateDistPackage();

if (validateOnly) {
  if (existsSync(zipPath)) validateZipPackage();
  console.log(`Validated package policy for ${relative(root, dist)}/`);
  process.exit(0);
}

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

validateZipPackage();

console.log(`Created ${relative(root, zipPath)} from ${relative(root, dist)}/`);
