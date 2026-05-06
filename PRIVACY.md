# Privacy

PromptDeck is designed to be local-first. Prompt content, prompt metadata, settings, versions, variants, and backups are stored in the user's browser storage unless the user explicitly exports them or later enables a sync provider.

## Data PromptDeck Stores

PromptDeck may store:

- prompt titles, commands, aliases, tags, and descriptions
- prompt bodies
- prompt versions and changelog notes
- prompt variants
- placeholder metadata
- usage counts and last-used timestamps
- host-specific usage counts
- extension settings such as trigger string, insertion mode, theme, and disabled hosts
- local import/export metadata

## Where Data Is Stored

Prompt library data is stored locally in the browser through IndexedDB. Settings are stored locally through `chrome.storage.local` or the browser equivalent.

Data is tied to the browser profile where the extension is installed.

## Whether Data Leaves The Device

PromptDeck does not upload prompt content by default.

Prompt content can leave the browser only when the user chooses to:

- insert or paste a prompt into a website
- copy a prompt to the clipboard
- export a backup file
- import data from a user-selected file
- later enable a future sync provider, if one is implemented

PromptDeck does not currently include cloud sync.

## Accounts And Analytics

- No account is required.
- No analytics are included.
- No telemetry is included.
- No advertising or tracking scripts are included.

## Import And Export

JSON export creates a user-controlled backup file containing prompts, versions, variants, aliases, tags, and optionally settings. Anyone with access to that file may be able to read prompt content inside it.

Import reads a user-selected local backup file and previews the impact before applying changes.

## Extension Permissions

### `storage`

Used to save PromptDeck prompts and settings locally.

### `clipboardWrite`

Used only to copy a selected prompt when the user asks PromptDeck to copy or when direct insertion is unreliable and PromptDeck falls back to copy.

### Content Script Access

PromptDeck uses a content script across websites so it can detect the local trigger in active editable fields. The content script is intended to read only the active text editing context needed for autocomplete and insertion. It does not scrape chat history, read full pages, or send page content anywhere.

## User Caution

Do not store secrets, passwords, API keys, private keys, or highly sensitive data in PromptDeck unless you are comfortable storing that data locally in your browser profile and in any backup files you export.

Protect exported backup files as you would protect any document containing private prompt content.
