# Roadmap

This roadmap is directional. It does not imply dates or commitments.

## Reliability

- Improve direct insertion behavior in more rich-text editors.
- Add better diagnostics when insertion falls back to clipboard.
- Make content-script refresh behavior clearer in the UI after settings changes.

## Browser And Provider Support

- Continue prioritizing generic editable-field support over provider-specific DOM hooks.
- Add lightweight site adapters only when generic behavior is insufficient.
- Expand manual QA coverage for ChatGPT, Claude, Gemini, Perplexity, Poe, Open WebUI, Notion, Google Docs, Slack, Gmail, and generic text fields.

### Manual Insertion QA Matrix

Use this matrix for release checks after insertion adapter changes. A pass means PromptDeck either inserts through the direct editor pipeline without corrupting/emptying the editor, or cleanly falls back to clipboard with the typed command left intact.

| Surface | Expected adapter | Status |
| --- | --- | --- |
| ChatGPT | ProseMirror | Ready for manual QA |
| Claude | Lexical | Ready for manual QA |
| Gemini | Generic contenteditable or text input | Ready for manual QA |
| Perplexity | Generic contenteditable or text input | Ready for manual QA |
| Notion | ProseMirror or generic contenteditable fallback | Ready for manual QA |
| Google Docs | Clipboard fallback if direct insertion cannot verify | Ready for manual QA |
| Slack | Lexical/Slate/Draft or generic contenteditable fallback | Ready for manual QA |
| Gmail | Generic contenteditable fallback | Ready for manual QA |
| Plain textarea/input | Text input | Covered by unit tests |

## System-Wide Prompt Access

Shipped:

- Terminal CLI (`promptdeck`) for listing, searching, showing, printing, and copying prompts, plus backup import/export and `doctor`. Reuses the shared fuzzy search and variant/version resolution.
- A local-first JSON file store (default `~/.promptdeck/library.json`) shared by all non-browser surfaces, with backup bridges to and from the browser extension.
- VS Code extension with Command Palette / Quick Pick search, insert, copy, and backup import/export.
- Native desktop / clipboard access through `promptdeck copy` and the interactive `promptdeck pick`, bindable to OS shortcuts and launchers.
- Machine-readable `--json` output and non-interactive commands for coding agents and editors.

Still exploring:

- Richer per-surface configuration and host/site preferences for the file store.
- Optional deeper editor integrations (inline completion, snippets) beyond the command surface.
- Keep browser extension usage fully supported; continue treating the backup format as the bridge between IndexedDB and the file store.
- Continue avoiding account, backend, telemetry, or cloud requirements for system-wide usage.

## Prompt Library Management

- Improve version and variant workflows.
- Add stronger duplicate/collision resolution.
- Add richer per-site favorites and preferences.
- Improve bulk editing for tags and aliases.

## Import And Export

- Add Markdown folder import.
- Improve Markdown export coverage for versions and variants.
- Add more resilient backup validation and recovery tools.

## Accessibility

- Improve keyboard coverage in the manager dashboard.
- Audit screen reader labels for the autocomplete helper and version/diff controls.
- Add focused contrast and reduced-motion checks.

## Testing

- Add Playwright-based extension smoke tests.
- Add browser-level tests for contenteditable insertion behavior.
- Add package validation checks for Chrome Web Store release builds.

## Future Sync

- Keep the existing sync provider interface clean.
- Explore optional encrypted sync behind explicit user opt-in.
- Do not add account, backend, or telemetry requirements to local-first usage.
