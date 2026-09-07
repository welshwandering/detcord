# Security Policy

## Supported versions

| Version | Supported |
| --- | --- |
| 1.x | Yes |

## Security principles

Detcord runs inside Discord's browser page and needs access to the same authenticated API used by the web client. The project limits that access to the deletion task and does not send data anywhere except Discord.

### Token handling

- **Never stored**: Discord tokens are not written to local storage, progress records, files, or logs.
- **Never logged**: Tokens must not appear in console output, errors, screenshots, or diagnostic reports.
- **Discord only**: Tokens are sent only to official `discord.com` API endpoints.
- **Webpack first**: Automatic extraction first reads Discord's token manager through its webpack module cache.
- **No synthetic events**: Token extraction does not dispatch synthetic browser events to intercept a token.
- **Account-bound manual entry**: A manually supplied token is checked through `/users/@me` and bound to that account before a run can start.
- **Masked in the UI**: A token is never displayed in full.

### Storage

Discord removes `window.localStorage` from its own page. Detcord's `getPageStorage()` helper first uses page storage when it is usable and otherwise creates a hidden same-origin iframe and uses that frame's storage.

The iframe stores deletion progress only. It never receives or stores the Discord token. Progress is saved every 10 deletions and on Stop, validated when read, tied to the author and target, and expires after 24 hours.

### Data privacy

- All processing happens in the browser.
- Detcord has no telemetry or analytics.
- Network requests are limited to `discord.com`.
- The development debug interface is not exposed by production builds.

### Input and action validation

- User-visible content is rendered as text or escaped before HTML insertion.
- Regular expressions are validated before preview and deletion.
- Discord IDs are validated before URL construction.
- Saved progress is schema-validated before restoration.
- The preview must finish before confirmation is enabled.
- Message ownership is checked again before deletion.

## Security measures

### ReDoS protection

User-provided regular expressions are checked for excessive length, invalid syntax, nested quantifiers, overlapping alternatives, and unsafe execution behaviour. Every path that accepts a pattern must use the same validator.

### Discord ID validation

Guild, channel, author, and message IDs are treated as Discord snowflakes and validated before use.

### API errors

All API failures are represented as typed `DiscordApiError` values. Authentication failures stop the run, archived-thread and other forbidden deletions are reported as skipped, missing messages are reported as already gone, and retryable failures remain visible to the engine rather than being converted into success.

## Reporting a vulnerability

Do not open a public issue for a vulnerability.

1. Report it through [GitHub Security Advisories](https://github.com/canaryframe/detcord/security/advisories/new).
2. Include the affected version, impact, reproduction steps, and any suggested remediation.
3. Remove tokens, message content, and other private Discord data from the report.

We aim to acknowledge a report within 48 hours and provide an initial assessment within 7 days.

## Security guidance for users

1. Install Detcord only from the [official releases](https://github.com/canaryframe/detcord/releases).
2. Never share a Discord token with another person or paste it into a public report.
3. Keep the browser and userscript manager updated.
4. Review the preview before confirming an irreversible deletion.
5. Log out of Discord if you believe a token has been exposed.

## Known limitations

- Any script or extension running with access to `discord.com` may be able to reach the same page data.
- Detcord cannot protect against a malicious browser extension.
- Discord may detect or restrict automated deletion.
- Webpack token extraction depends on Discord's internal modules and may break when Discord changes them.
- Discord does not allow deletion from archived threads.

## Technical notes

### Userscript isolation

Detcord runs with `@grant none` so it can access Discord's page context and webpack modules. This means it does not receive userscript-manager API isolation from other code running on the page.

### Token extraction

The primary extraction path inspects Discord's webpack module cache for its token manager. Fallback handling does not persist the token or manufacture browser events to capture it. Manual tokens are validated against Discord's current-user endpoint before their account identity is accepted.

## Audit history

| Date | Auditor | Findings | Status |
| --- | --- | --- | --- |
| 2026-09-07 | Maintainer review plus a five-reviewer blind adversarial panel | Six critical (release packaging, userscript versioning, rate-limit contract, resume, filtered-loop, preview/apply target), remainder high, medium or low | Fixed in 1.1.0 |
| 2026-01-02 | Internal review | 8 findings: 2 high, 3 medium, and 3 low | Resolved in 1.0.0 |

### v1.1.0 security fixes

- Closed a ReDoS guard bypass so preview and deletion use the same validated pattern path.
- Bound manual tokens to the account returned by Discord before loading or deleting that account's messages.
- Added an ownership guard immediately before every delete request.
- Cancelled the countdown when the Detcord window closes, preventing a hidden run from starting.
- Required a completed preview before deletion confirmation can proceed.

### v1.0.0 security audit summary

#### High severity

1. **ReDoS vulnerability**: User-provided patterns could trigger catastrophic backtracking. Resolved by adding pattern analysis and execution-time checks.
2. **Token exposure through the debug interface**: The production `window.Detcord` object exposed the UI instance. Resolved by limiting the interface to development builds.

#### Medium severity

1. **Insufficient ID validation**: Guild and channel IDs reached URL construction without validation. Resolved by adding snowflake validators.
2. **Inconsistent XSS handling**: Some dynamic UI paths used `innerHTML`. Resolved by using text nodes or escaping dynamic content.
3. **Unvalidated persistence JSON**: Saved progress was parsed without a runtime schema check. Resolved by validating records before restoration.

#### Low severity

1. **Missing token format validation**: Extracted tokens were accepted without a format check. Resolved by validating the token before API use.
2. **Undocumented page-context trade-off**: The effect of `@grant none` was not documented. Resolved in this policy.
3. **Webpack module reference lifetime**: Discord may retain the inspected module in its own cache. Documented as a limitation.
