# PromptDeck

[![Install from Chrome Web Store](https://img.shields.io/badge/Chrome%20Web%20Store-Install-blue?logo=googlechrome&logoColor=white)](https://chromewebstore.google.com/detail/promptdeck/ibhheacppbbekiihiabfmplinfopcind)
[![Version](https://img.shields.io/github/package-json/v/orkunkinay/promptdeck?label=version)](https://github.com/orkunkinay/promptdeck)
[![License](https://img.shields.io/github/license/orkunkinay/promptdeck)](LICENSE)


PromptDeck is a local-first prompt command center for people who reuse serious prompts across AI tools.

It is a Chrome/browser extension that lets you save reusable prompts, trigger them with `;;`, search them through a compact autocomplete helper, manage versions and variants, and import/export local backups. PromptDeck is early, but it is built around a durable product principle: prompt content should stay under the user's control.

## See PromptDeck in Action

PromptDeck is designed to stay out of the way while making your best prompts instantly available across AI tools.

<div align="center">
  <video src="https://github.com/user-attachments/assets/f2f0d833-297b-497a-a983-c37cc8d44055" controls width="100%" muted>
    Your browser does not support embedded video.
  </video>
</div>




---

### Lightweight Command Helper

Type your trigger, search your prompt library, and insert the selected prompt directly into the active composer.

<p align="center">
  <img
    src="public/autocomplete_helper.png"
    alt="PromptDeck lightweight command helper"
    width="720"
  />
</p>

---

### Local-First Prompt Manager

Create, organize, version, and back up reusable prompts from a focused dashboard built for serious prompt workflows.

Open the PromptDeck manager anytime with the keyboard shortcut:

- **Windows/Linux:** `Ctrl + K`
- **macOS:** `Command + K`

<p align="center">
  <img
    src="public/manager_ui.png"
    alt="PromptDeck local-first prompt manager dashboard"
    width="920"
  />
</p>

## Why PromptDeck Exists

Power users often keep their best prompts scattered across notes, docs, snippets, and chat history. PromptDeck turns those prompts into a fast local command layer that works where people already write: ChatGPT, Claude, Gemini, etc.

PromptDeck is not a prompt marketplace, AI prompt generator, chat-history reader, or cloud account system. It is a local prompt library and insertion helper.

## Core Features

- Local prompt library with create, edit, delete, duplicate, aliases, tags, search, and usage stats.
- Compact trigger UI: type `;;` or `;;paper` in a supported text field.
- Prompt versions for historical evolution, including restore, default selection, deletion, and diff comparison.
- Prompt variants for intentional alternatives such as `:short`, `:latex`, or `:prod`.
- Placeholder text such as `{{paper_text}}` is preserved exactly as written.
- Generic insertion for textareas, inputs, and contenteditable fields.
- Clipboard fallback when direct insertion is unreliable.
- Configurable insertion mode: prefer direct, always copy, or ask every time.
- JSON backup import/export with schema versioning and migration support.
- Markdown export for individual prompts.
- Minimal Manifest V3 extension permissions.

## Installation From Source

PromptDeck is not claimed to be available on the Chrome Web Store yet. To install it from source:

```bash
git clone <repository-url>
cd PromptDeck
npm install
npm run build
```

Then load it in Chrome or another Chromium browser:

1. Open `chrome://extensions`.
2. Enable **Developer mode**.
3. Click **Load unpacked**.
4. Select the `dist/` folder.
5. Open a website with a text composer and type `;;`.

After rebuilding locally, click the extension reload button in `chrome://extensions`, then refresh any open page where you want to use PromptDeck.

## Development

```bash
npm install
npm run dev
```

For extension testing, the production-like build is usually more reliable than the Vite dev server:

```bash
npm run build
```

The content script is bundled separately through `vite.content.config.ts` so `dist/content/index.js` is a self-running script suitable for Manifest V3 content script loading.

## Scripts

```bash
npm run dev              # Start Vite for UI development
npm run typecheck        # Run TypeScript checks
npm run lint             # Run the repository lint gate
npm test                 # Run unit tests
npm run build            # Build the unpacked extension into dist/
npm run build:debug      # Build dist/ with sourcemaps and readable content scripts
npm run package:chrome   # Build and create promptdeck-chrome-extension.zip
```

`npm run package:chrome` creates a Chrome Web Store-ready zip from the `dist/` output folder, not from the repository root.

## Project Structure

```text
src/
  background/              Manifest V3 service worker and runtime messages
  content/
    commandDetection/      Trigger parsing and false-positive heuristics
    insertion/             Generic insertion and clipboard fallback
    adapters/              Generic site adapter boundary
  popup/                   Small browser action popup
  options/                 Prompt manager dashboard
  shared/
    backup/                Backup planning, validation, and migration
    importExport/          JSON and Markdown import/export helpers
    models/                Prompt, version, variant, and settings types
    promptCompiler/        Placeholder extraction and compilation helpers
    search/                Local fuzzy ranking
    settings/              Browser settings service
    storage/               Dexie repository and migration layer
    sync/                  Local sync interface and future cloud placeholder
    versioning/            Version, variant, diff, restore, and delete logic
  tests/                   Vitest coverage for core behavior
```

## Privacy And Local-First Model

PromptDeck is designed to be local-first.

- No account is required.
- No server is required for normal use.
- No analytics or telemetry are included.
- Prompt content, metadata, versions, variants, and settings are stored in the user's browser storage.
- Prompt content does not leave the browser unless the user explicitly exports it, copies it, pastes it into a site, or later enables a future sync provider.
- JSON import/export is user-controlled.
- The extension requests `storage` and `clipboardWrite`.
- The content script runs on pages so it can detect the local trigger in active editable fields. It does not scrape full page content or chat history.

See [PRIVACY.md](PRIVACY.md) for more detail.

## Extension Permissions

- `storage`: stores PromptDeck settings and local data.
- `clipboardWrite`: copies a selected prompt when the user chooses copy or when direct insertion falls back to clipboard.
- `content_scripts.matches: <all_urls>`: lets PromptDeck work as a universal prompt helper in editable fields across websites. This broad match is part of the product's single purpose and should not be expanded with additional privileged permissions unless strictly necessary.

No `activeTab`, `tabs`, `scripting`, host permissions, analytics, or remote hosted JavaScript are used.

## Troubleshooting

### The Helper Does Not Open

- Confirm the current trigger in the PromptDeck manager. The default is `;;`.
- Chrome system pages such as `chrome://extensions` do not allow normal extension content scripts.
- Check whether PromptDeck is disabled for the current site.
- If working from source, reload the extension in `chrome://extensions` and then refresh the target page.

### Direct Insertion Is Unreliable

Some rich editors block or rewrite synthetic insertion. PromptDeck falls back to clipboard when possible. For sites that resist direct insertion, use **Always copy to clipboard** or **Ask every time**.

### Data After Browser Restarts

PromptDeck stores data in the current browser profile. Normal browser and computer restarts should keep data. Data can be lost if the browser profile is deleted, extension data is cleared, the extension is removed with its local data, or a different Chrome profile is used. Use JSON export for backups before risky browser cleanup or reinstall work.

## Roadmap

See [ROADMAP.md](ROADMAP.md).

## Contributing

Contributions are welcome. Please read [CONTRIBUTING.md](CONTRIBUTING.md) before opening a pull request.

For security-sensitive issues, read [SECURITY.md](SECURITY.md) and report privately.

## License

PromptDeck is released under the MIT License. See [LICENSE](LICENSE).
