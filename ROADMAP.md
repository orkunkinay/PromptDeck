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
