# PromptDeck for VS Code

Use your local-first PromptDeck library directly inside VS Code. This extension
reuses the same shared core and local file store as the [PromptDeck CLI](../../README.md#terminal-cli),
so prompts, versions, variants, tags, and usage stats stay consistent across
surfaces. No account, backend, or telemetry.

## Commands

Open the Command Palette (`Cmd/Ctrl+Shift+P`) and run:

- **PromptDeck: Search Prompt** — search, then choose Insert / Copy / Show.
- **PromptDeck: Insert Prompt** — insert the resolved prompt at the cursor (or replace the selection).
- **PromptDeck: Copy Prompt** — copy the resolved prompt to the clipboard.
- **PromptDeck: Import Backup** — import a `promptdeck.backup` JSON file.
- **PromptDeck: Export Backup** — export the library as a PromptDeck backup.
- **PromptDeck: Open Library File** — open `library.json` in the editor.

The Quick Pick lists each prompt plus every addressable variant and non-default
version (for example `/paper-reading` and `/paper-reading:short`), so you can
pick a specific variant without typing a suffix.

When a prompt contains `{{placeholder}}` tokens, Insert and Copy ask for each
value via input boxes (prefilled with any default) and use the filled result.
**Show content** displays the raw template with placeholders intact.

## Library location

By default the extension reads `~/.promptdeck/library.json` (or the path from
`PROMPTDECK_LIBRARY` / `PROMPTDECK_HOME`). Override it per-workspace with the
`promptdeck.libraryPath` setting.

## Run it locally (Extension Development Host)

From the repository root, install dependencies once (`npm install`). Then:

```bash
cd extensions/vscode
npm run build          # bundles src/extension.ts -> dist/extension.js with esbuild
```

Open the `extensions/vscode` folder in VS Code and press `F5` (or run the
"Run PromptDeck Extension" launch config) to start an Extension Development Host
with PromptDeck loaded. `npm run watch` rebuilds on change.

> The build script resolves `esbuild` from the repository root `node_modules`,
> so a local `npm install` inside `extensions/vscode` is only needed for
> editor type-checking (`@types/vscode`).

## Package a VSIX

```bash
cd extensions/vscode
npm install            # installs @types/vscode, esbuild, typescript locally
npm run build
npx @vscode/vsce package
```

This produces `promptdeck-vscode-0.1.0.vsix`, which you can install with
**Extensions: Install from VSIX…** or `code --install-extension <file>.vsix`.

## Notes / limitations

- The extension uses Node's filesystem APIs and is intended for desktop VS Code,
  not web/browser VS Code.
- It shares the same file store as the CLI; changes made in one are visible in
  the other.
