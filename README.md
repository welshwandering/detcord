# Detcord

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://opensource.org/licenses/MIT)
[![Build Status](https://img.shields.io/github/actions/workflow/status/welshwandering/detcord/ci.yml?branch=main)](https://github.com/welshwandering/detcord/actions)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.7-blue.svg)](https://www.typescriptlang.org/)
[![Code Style: Biome](https://img.shields.io/badge/Code%20Style-Biome-orange.svg)](https://biomejs.dev/)

**Bulk delete your own Discord messages** from channels, DMs, or entire servers.

Discord doesn't let you mass-delete messages—Detcord does. Filter by date, content, links, or regex. Pause and resume large operations. 100% browser-based, no data leaves your machine.

## Quick Start

1. Install [Tampermonkey](https://www.tampermonkey.net/) (or another userscript manager)
2. **[Click here to install Detcord](https://github.com/welshwandering/detcord/releases/latest/download/detcord.user.js)**
3. Open [Discord](https://discord.com/app) in your browser
4. Click the Detcord button → Select target → Delete

---

## Important Disclaimers

> **This project is independent and is NOT affiliated with, endorsed by, or connected to Discord Inc.**

> **Discord may change their API at any time, which could break this tool without notice.**

> **This software is provided AS-IS without warranty. Use at your own risk.**

> **We have made security a priority, but we cannot guarantee the safety of your data.**

> **Only YOUR OWN messages can be deleted. This is a Discord API limitation.**

---

## What is Detcord?

Detcord is a browser userscript that allows you to bulk delete your own Discord message history. Discord does not provide native bulk deletion functionality, requiring users to delete messages one at a time. This tool automates that process while respecting Discord's rate limits.

### Features

- **Bulk delete your own messages** from any channel, DM, or entire server
- **Flexible filtering** by date range, text content, attachments, links, and regex patterns
- **Resume capability** for large deletion operations
- **Rate limit aware** with adaptive delays to avoid API throttling
- **Privacy-focused** - all operations run locally in your browser
- **Real-time progress** tracking with estimated time remaining
- **Pause/Resume/Stop** controls for deletion operations

### Why Detcord?

| | Detcord | Other Tools |
|---|:---:|:---:|
| TypeScript codebase | ✓ | ✗ |
| Tested (80%+ coverage) | ✓ | ✗ |
| Security documentation | ✓ | ✗ |
| Modular architecture | ✓ | ✗ |
| Modern tooling (Vite, Biome) | ✓ | ✗ |
| Active maintenance | ✓ | Varies |

---

## Installation

### Prerequisites

You need a userscript manager browser extension installed:

- **[Tampermonkey](https://www.tampermonkey.net/)** (Recommended - Chrome, Firefox, Edge, Safari, Opera)
- **[Violentmonkey](https://violentmonkey.github.io/)** (Chrome, Firefox, Edge)
- **[Greasemonkey](https://www.greasespot.net/)** (Firefox)

### Steps

1. Install one of the userscript managers listed above
2. **[Click here to install Detcord](https://github.com/welshwandering/detcord/releases/latest/download/detcord.user.js)**
3. Your userscript manager will prompt you to install - click "Install"
4. Navigate to [Discord](https://discord.com/app) in your browser
5. A floating Detcord button will appear - click it to open the control panel

---

## Usage Guide

### Getting Started

1. **Open Discord** in your web browser (not the desktop app)
2. **Navigate** to the channel or DM you want to clean up
3. **Click the Detcord button** in the toolbar to open the control panel

### Selecting a Target

Choose what you want to delete messages from:

- **Current Channel** - Delete messages from the channel you're viewing
- **Current DM** - Delete messages from the direct message conversation
- **Entire Server** - Delete your messages across all channels in a server

### Filtering Messages

Narrow down which messages to delete:

| Filter | Description |
|--------|-------------|
| **After Date** | Only delete messages sent after this date |
| **Before Date** | Only delete messages sent before this date |
| **Contains** | Only delete messages containing specific text |
| **Has Links** | Only delete messages with URLs |
| **Has Files** | Only delete messages with attachments |
| **Include Pinned** | Include pinned messages (off by default) |
| **Regex Pattern** | Advanced filtering with regular expressions |

### Deletion Process

1. **Preview** - Detcord will scan and count matching messages
2. **Confirm** - Review the count before proceeding
3. **Delete** - Click "Start Deletion" to begin
4. **Monitor** - Watch real-time progress, pause/resume as needed

### Controls During Deletion

- **Pause** - Temporarily halt deletion (can resume later)
- **Resume** - Continue a paused deletion
- **Stop** - Cancel the operation entirely

---

## FAQ

### Is this safe to use?

We have worked hard to make Detcord secure, but we offer no guarantees. The tool:

- Never stores your authentication token
- Never transmits data to any third parties
- Only operates on your own messages
- Runs entirely in your browser

See our [Security Policy](SECURITY.md) for more details.

### Can I delete other people's messages?

**No.** Discord's API only allows users to delete their own messages. This is a platform limitation, not a limitation of Detcord.

### Why is deletion slow?

Discord enforces strict rate limits on their API (approximately 5 deletions per second). Detcord respects these limits to avoid getting your account flagged. Large deletion operations may take hours.

### Will this work with the Discord desktop app?

**No.** Detcord is a userscript that only works in web browsers. You must use Discord at [discord.com/app](https://discord.com/app) in a browser with a userscript manager installed.

### What happens if I close my browser during deletion?

The deletion will stop. When you return and reopen Detcord, you can start a new deletion operation. Previously deleted messages will not be re-processed.

### Can Discord detect this tool?

While Detcord makes standard API requests that look like normal Discord usage, we cannot guarantee that Discord will not detect or take action against automated tools. **Use at your own risk.**

### The tool stopped working. What happened?

Discord may have changed their API. Check the [GitHub Issues](https://github.com/welshwandering/detcord/issues) page to see if others have reported the same problem.

---

## Supported Browsers

| Browser | Status |
|---------|--------|
| Chrome | Supported |
| Firefox | Supported |
| Edge | Supported |
| Safari | Supported (with Tampermonkey) |
| Opera | Supported |

---

## Troubleshooting

### "Token not found" error

- Make sure you are logged into Discord
- Try refreshing the page
- Try logging out and back into Discord

### "Rate limited" messages

This is normal. Detcord will automatically wait and retry when rate limited.

### Messages not being deleted

- Ensure you are the author of the messages
- System messages (joins, boosts, etc.) may not be deletable
- Some message types in archived threads cannot be deleted

---

## License

This project is licensed under the MIT License. See the [LICENSE](LICENSE) file for details.

---

## Contributing

We welcome contributions! Please see our [Contributing Guide](CONTRIBUTING.md) for details.

Before contributing, please read:
- [CONTRIBUTING.md](CONTRIBUTING.md) - Contribution guidelines

---

## Support

- **Issues**: [GitHub Issues](https://github.com/welshwandering/detcord/issues)
- **Discussions**: [GitHub Discussions](https://github.com/welshwandering/detcord/discussions)

---

*Detcord is an independent project. Discord is a trademark of Discord Inc.*
