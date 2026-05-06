# Open-Source Release Checklist

Use this checklist before making PromptDeck public.

## Repository

- [ ] Generated files are not committed: `dist/`, build zips, coverage, reports, traces, videos, and logs.
- [ ] `.DS_Store` and local machine files are absent.
- [ ] `.gitignore` covers local, generated, and test artifact paths.
- [ ] No secrets, API keys, private URLs, local filesystem paths, or personal data are committed.
- [ ] License, privacy, security, contributing, changelog, and code of conduct files are present.

## Product

- [ ] `npm install` works from a fresh clone.
- [ ] `npm run typecheck` passes.
- [ ] `npm run lint` passes.
- [ ] `npm test` passes.
- [ ] `npm run build` passes.
- [ ] The unpacked `dist/` extension loads in `chrome://extensions`.
- [ ] The prompt manager opens.
- [ ] The autocomplete helper opens after typing `;;` in a supported editor.
- [ ] Direct insertion and clipboard fallback both work.
- [ ] JSON backup export/import works.

## Privacy And Security

- [ ] Permissions are still minimal and documented.
- [ ] No remote hosted JavaScript is used.
- [ ] No analytics or telemetry are included.
- [ ] Import parsing validates data before writing.
- [ ] Storage/schema changes include migration notes and tests.

## Chrome Package

- [ ] `npm run package:chrome` creates `promptdeck-chrome-extension.zip`.
- [ ] The zip contains `manifest.json` at the root.
- [ ] The zip does not contain source files, tests, `node_modules`, source maps, logs, or local artifacts.
- [ ] Icons render correctly at 16, 32, 48, and 128 pixels.
