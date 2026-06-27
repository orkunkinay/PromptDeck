# PromptDeck for VS Code

Use your local-first PromptDeck library directly inside VS Code. This extension
reuses the same shared core and local file store as the [PromptDeck CLI](../../README.md#terminal-cli),
so prompts, versions, variants, tags, and usage stats stay consistent across
surfaces. No account, backend, or telemetry.

## Commands

Open the Command Palette (`Cmd/Ctrl+Shift+P`) and run:

- **PromptDeck: Open Manager** — open the full PromptDeck manager in the editor area.
- **PromptDeck: Search Prompt** — search, then choose Insert / Copy / Show.
- **PromptDeck: Insert Prompt** — insert the resolved prompt at the cursor (or replace the selection).
- **PromptDeck: Copy Prompt** — copy the resolved prompt to the clipboard.
- **PromptDeck: New Prompt** — open a prompt document for a new prompt; save it to add it to the library.
- **PromptDeck: Edit Prompt** — edit a prompt document and save it back in place.
- **PromptDeck: Duplicate Prompt** — open a copy as a new prompt document.
- **PromptDeck: Delete Prompt** — delete a prompt after a modal confirmation.
- **PromptDeck: Import Backup** — import a `promptdeck.backup` JSON file.
- **PromptDeck: Export Backup** — export the library as a PromptDeck backup.
- **PromptDeck: Open Library File** — open `library.json` in the editor.

The PromptDeck activity bar view lists prompts at the top level, with variants
and non-default versions underneath. Use the view title and item context menus
to create, edit, duplicate, or delete prompts.

## Manager

The manager is the app-like VS Code surface for the central PromptDeck file
library. It edits the same library as the CLI, not the current repository
directory, and shows the active library path in the sidebar.

Use it to:

- Browse and search prompts.
- Create, edit, duplicate, and delete prompts.
- Edit command metadata, aliases, tags, descriptions, prompt content, placeholders, variants, and versions.
- Import and export PromptDeck backup JSON files.
- Insert a resolved prompt into the active editor.
- Copy a resolved prompt to the clipboard.
- Open the underlying `library.json` file when you need to inspect the raw store.

Insert and Copy prompt for `{{placeholder}}` values with VS Code input boxes
before using the filled result. If there is no active editor, insertion falls
back to copying.

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
npm run build          # bundles dist/extension.js and dist/webview/manager.js
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
npm run typecheck      # tsc -p . (also runs in CI)
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
