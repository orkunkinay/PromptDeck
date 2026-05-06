# Security Policy

PromptDeck handles user-authored prompt content, so security and privacy issues are treated seriously.

## Reporting A Vulnerability

Please report security issues privately by opening a GitHub security advisory or contacting the maintainer through a private project channel.

Do not publicly disclose serious vulnerabilities until maintainers have had a reasonable chance to investigate and respond.

## Security-Sensitive Areas

Please report issues involving:

- prompt data exposure
- extension permission escalation
- cross-site injection or DOM injection bugs
- unsafe clipboard behavior
- unsafe import or backup parsing
- storage corruption or migration data loss
- content scripts reading more page content than necessary
- remote hosted JavaScript or remote code execution
- future sync or encryption failures if sync is implemented later

## Current Security Posture

- PromptDeck is local-first.
- Prompt content is stored in browser-local storage.
- PromptDeck does not require an account.
- PromptDeck does not upload prompt content by default.
- PromptDeck does not include analytics or telemetry.
- PromptDeck uses Manifest V3.
- PromptDeck requests `storage` and `clipboardWrite`.
- PromptDeck does not request `tabs`, `activeTab`, `scripting`, or host permissions.

## Handling Expectations

Maintainers should acknowledge private vulnerability reports, investigate impact, prepare a fix when appropriate, and credit reporters if they want to be credited.
