# Contributing To PromptDeck

Thanks for considering a contribution. PromptDeck is early, local-first browser extension software, so changes should preserve user trust, privacy, and predictable behavior.

## Setup

```bash
git clone https://github.com/orkunkinay/PromptDeck.git
npm install
```

## Development

```bash
npm run dev
```

For realistic extension testing, build and load the unpacked extension:

```bash
npm run build
```

Then open `chrome://extensions`, enable Developer mode, click **Load unpacked**, and select `dist/`.

After code changes:

1. Rebuild with `npm run build`.
2. Reload the extension in `chrome://extensions`.
3. Refresh any website where PromptDeck is already open.

## Quality Checks

Run these before opening a pull request:

```bash
npm run typecheck
npm run lint
npm test
npm run build
```

Use `npm run package:chrome` when validating Chrome Web Store packaging.

## Code Style

- Prefer TypeScript types over implicit data shapes.
- Keep content-script logic generic. Do not add brittle provider-specific DOM selectors unless there is no reasonable generic option.
- Keep UI changes consistent with the existing design tokens in `src/shared/styles.css`.
- Prefer small, focused changes over broad rewrites.
- Avoid adding dependencies unless they clearly reduce risk or complexity.
- Do not add analytics, telemetry, remote hosted JavaScript, cloud services, accounts, billing, or tracking.

## Adding Site Or Provider Support

PromptDeck should work through generic editable-field handling first:

- `textarea`
- supported text-like `input` types
- contenteditable editors
- Selection/Range APIs
- clipboard fallback

If a site needs special handling, keep it behind an adapter boundary, document why the generic approach is insufficient, and avoid selectors tied to unstable internal UI structure.

## Storage, Schema, Import/Export, And Sync

Changes affecting storage require extra care.

- Consider backward compatibility for existing local users.
- Add or update migrations when schemas change.
- Keep JSON import/export compatible with older backups where possible.
- Validate untrusted import data before writing it to storage.
- Add tests for migrations and import/export round trips.
- Treat sync as future architecture only unless a specific implementation is being reviewed.

Any change touching storage, backup parsing, import/export, sync interfaces, or prompt versioning should explain compatibility implications in the pull request.

## Pull Requests

Good pull requests include:

- a clear summary
- screenshots for visible UI changes
- test coverage for behavioral changes
- notes about storage or permission impact
- documentation updates when behavior changes

Please keep pull requests scoped. Large refactors are easier to review when split from feature work.

## Reporting Issues

When reporting a bug, include:

- browser and version
- operating system
- PromptDeck version or commit
- site where the issue happened
- expected behavior
- actual behavior
- reproduction steps
- whether the issue affects autocomplete, insertion, storage, import/export, or the manager UI
- screenshots or logs if they do not expose private prompt content

Do not paste sensitive prompts, secrets, private documents, or private chat content into public issues.
