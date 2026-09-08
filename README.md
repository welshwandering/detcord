# Detcord

[![Licence: MIT](https://img.shields.io/badge/Licence-MIT-blue.svg)](LICENSE)
[![CI](https://github.com/canaryframe/detcord/actions/workflows/ci.yml/badge.svg?branch=main)](https://github.com/canaryframe/detcord/actions/workflows/ci.yml)

Detcord is a browser userscript for finding and permanently deleting your own Discord messages. Discord has no bulk-delete interface for user messages, so Detcord provides a guided target, filter, review, and deletion flow while respecting Discord's API limits.

## Important disclaimers

> **Detcord is independent and is not affiliated with, endorsed by, or connected to Discord Inc.**

> **Discord can change its API at any time, which may break Detcord without notice.**

> **This software is provided as-is, without warranty. Deleted messages cannot be recovered.**

> **Detcord can delete only your own messages. This is enforced by Discord's API.**

## Install

Detcord follows your Discord light or dark theme.

Detcord needs a userscript manager:

- [Tampermonkey](https://www.tampermonkey.net/)
- [Violentmonkey](https://violentmonkey.github.io/)

### Chromium browsers

Chrome, Edge, Brave, Opera, and Vivaldi require extra browser settings before Tampermonkey can inject any userscript:

1. Install Tampermonkey.
2. Open `chrome://extensions` and turn on **Developer mode**.
3. Open Tampermonkey's **Details** page and turn on **Allow user scripts**.
4. Install [detcord.user.js](https://github.com/canaryframe/detcord/releases/latest/download/detcord.user.js).
5. Open or reload [Discord in the browser](https://discord.com/app).

Without both toggles, the script can install successfully but silently fail to appear.

### Firefox

Install Tampermonkey or Violentmonkey, then install [detcord.user.js](https://github.com/canaryframe/detcord/releases/latest/download/detcord.user.js). Firefox does not require the two Chromium toggles.

## Usage

1. **Target**: choose the current channel or DM, the whole server, or selected channels in **Specific** mode.
2. **Range**: choose the exact period to search.
3. **Filters**: set text or regex matching, link or attachment requirements, and whether pinned messages are included.
4. **Review**: read the receipt showing the matched count, newest and oldest messages, skipped messages, and estimated duration. Deletion cannot be confirmed before this preview completes.

The commit button names the irreversible action and its scope, such as **Delete 12 messages**. Press and hold it for 1.5 seconds while it fills; releasing it, pressing Escape, or closing Detcord cancels the confirmation. With reduced motion enabled, Detcord uses a plain two-step confirmation instead. There is no countdown.

During deletion, one running view shows the large completed count, a thin progress bar, three outcome figures, and a time-aligned event log. Keep the Discord browser tab open while it works.

Use **Pause** to suspend an active run and **Stop** to end it. Stop interrupts current waits, saves progress, and leaves the run available for recovery.

Detcord saves progress every 10 deletions and when you press Stop. Saved sessions expire after 24 hours. When Detcord opens and finds a matching session for the signed-in account, it offers to resume with the saved filters, target, cursor, and counters. A resume covers only the run that saved it: where that run was sweeping several channels, it continues into the channels it never reached, and the prompt names how many of them are still queued before you accept.

Completion returns to the receipt and states the outcome in its title, such as **12 deleted**, **Stopped after 7**, or **3 could not be deleted**. It separates deleted messages from messages already gone, skipped messages such as archived-thread posts, and failures, and reports the run duration.

## Filters

Date presets use exact rolling timestamps captured when you select them. **Last 24 hours** means the preceding 24 hours, not two calendar dates.

| Filter | Behaviour |
| --- | --- |
| Everything | Applies no date boundary. |
| Last 24 hours | Matches messages newer than exactly 24 hours before the preset was selected. |
| Last 3 days | Matches messages newer than exactly 72 hours before the preset was selected. |
| Last 30 days | Matches messages newer than exactly 30 days before the preset was selected. |
| Older than 30 days | Matches messages older than exactly 30 days before the preset was selected. |
| Older than 90 days | Matches messages older than exactly 90 days before the preset was selected. |
| Custom range | Uses the supplied start and/or end boundary. |
| Text | Matches messages containing the supplied text. |
| Regex | Matches message content using a validated regular expression. Unsafe patterns are rejected. |
| Only with links | Requires a link in the message. |
| Only with attachments | Requires an attached file. |
| Include pinned messages | Includes pinned messages; they are excluded by default. |

Deletion runs newest first in v1.1.0. Oldest-first mode is hidden while its design is being revised.

## FAQ

### Is it safe?

Detcord runs in the Discord web page, sends requests only to Discord, does not include telemetry, and never writes your token to storage. Deletion is irreversible, so read the preview and use narrow filters when the scope matters. See [SECURITY.md](SECURITY.md) for the security model and reporting process.

### Why is deletion slow?

Discord controls the allowed request rate. Detcord waits 10 seconds between searches and starts with a 1-second delay between deletions. When Discord throttles a request, Detcord waits for `retry_after` and adds 50% of the gap to its deletion delay. After five clean deletions it reduces that delay by 10%. It also waits proactively when Discord reports no remaining requests.

### What happens while Discord is indexing search results?

A search can return a temporary 202 response while Discord updates its index. Detcord waits and retries. Empty result pages use five backoff waits: 10 seconds, 13 seconds, 16.9 seconds, 22 seconds, and 28.6 seconds.

### Does it work in the Discord desktop app?

No. Detcord is a browser userscript and must run at [discord.com/app](https://discord.com/app) through a userscript manager.

### What happens if I close the browser?

The active run stops. Reopen Discord and Detcord within 24 hours to accept the resume prompt. At most the work since the last ten-deletion checkpoint may need to be searched again; messages already deleted are treated as already gone.

### Can Discord detect Detcord?

Detcord uses Discord's authenticated web API and respects its rate-limit responses, but no automated tool can guarantee that Discord will not detect or act on its use. Use it at your own risk.

### Why are messages in archived threads skipped?

Discord rejects deletion from archived threads, including error code 50083. Detcord reports those messages as skipped rather than claiming that they were deleted.

### Can I leave the run in a background tab?

Yes, but Chromium throttles timers after a tab has been hidden for more than five minutes. The run will continue more slowly. Keep the tab visible for consistent pacing.

### The Detcord button does not appear

On Chromium, confirm that **Developer mode** is enabled on `chrome://extensions` and **Allow user scripts** is enabled on Tampermonkey's **Details** page, then reload Discord. Firefox does not need these settings.

## Troubleshooting

### The install link returns 404

Release v1.0.2 was published without the userscript asset. Use v1.1.0 or later. The permanent download URL remains:

<https://github.com/canaryframe/detcord/releases/latest/download/detcord.user.js>

### Token detection fails

- Confirm that you are signed in to Discord in the same browser profile.
- Reload Discord, then reopen Detcord.
- If you use manual token entry, confirm that the token belongs to the account currently shown in Discord.
- Never paste a token into an issue, screenshot, or console log.

### A run keeps waiting

Rate-limit and indexing waits are normal. If the status does not change after the reported wait, press Stop, reload Discord, and use the resume prompt.

### Expected messages are missing

- Confirm that the selected target and preview refer to the intended channel or channels.
- Check the exact date boundaries and other filters.
- Remember that only your own messages are returned for deletion.
- Messages in archived threads cannot be deleted.

### No resume prompt appears

Saved sessions are tied to the Discord account and target, expire after 24 hours, and are cleared after successful completion. Sessions created by v1.0.x cannot be resumed.

## Browser support

| Browser | Userscript manager | Notes |
| --- | --- | --- |
| Chrome | Tampermonkey | Requires **Developer mode** and **Allow user scripts**. |
| Edge | Tampermonkey | Requires **Developer mode** and **Allow user scripts**. |
| Brave | Tampermonkey | Requires **Developer mode** and **Allow user scripts**. |
| Opera | Tampermonkey | Requires **Developer mode** and **Allow user scripts**. |
| Vivaldi | Tampermonkey | Requires **Developer mode** and **Allow user scripts**. |
| Firefox | Tampermonkey or Violentmonkey | No Chromium toggles required. |
| Discord desktop app | None | Not supported. |

## Other tools

[Undiscord](https://github.com/victornpb/undiscord) is an established and still-maintained alternative with a larger user base, visual message picking, and archive import. Detcord focuses on a guided preview, resumable runs, and adaptive pacing; see the honest [tool comparison](docs/COMPARISON.md) before choosing.

## Contributing, security, and licence

- Read [CONTRIBUTING.md](CONTRIBUTING.md) and [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md) before contributing.
- Use [GitHub Issues](https://github.com/canaryframe/detcord/issues) for support, questions, bugs, and feature requests. GitHub Discussions is not enabled.
- Report vulnerabilities privately through [GitHub Security Advisories](https://github.com/canaryframe/detcord/security/advisories/new).
- Detcord is licensed under the [MIT Licence](LICENSE).

Discord is a trademark of Discord Inc.
