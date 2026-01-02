# How Detcord Compares to Other Tools

There are several tools that help delete Discord messages. This document provides an honest comparison to help you choose the right one for your needs.

---

## Quick Summary

| Tool | Type | Best For |
|------|------|----------|
| **Detcord** | Userscript | Users who want reliability, filtering options, and a polished experience |
| **Undiscord** | Userscript | Power users who want visual message picking and archive import |
| **Deleo** | CLI Tool | Developers who prefer terminal workflows |
| **MesDel** | Chrome Extension | Users who only need to clear DMs |

---

## Detcord vs Undiscord

[Undiscord](https://github.com/victornpb/undiscord) is the most popular Discord message deleter with over 6,000 GitHub stars. It's a mature, well-tested tool.

### What Detcord Does Differently

**Session Resume**
Detcord saves your progress periodically. If you close your browser or the page crashes during a large deletion, you can pick up where you left off. Undiscord requires starting over.

**Adaptive Rate Limiting**
Both tools handle Discord's rate limits, but Detcord uses a smoother approach. Instead of jumping between fast and slow speeds, Detcord gradually adjusts—increasing by 50% when throttled, then slowly recovering by 10% increments after consecutive successes. This results in steadier, more predictable deletion speeds.

**Empty Page Handling**
Discord's search index can be slow to update after deletions. Detcord handles this with exponential backoff (waiting 10s, then 20s, then 40s) before concluding there are no more messages. This prevents premature stops on large deletion jobs.

**Codebase**
Detcord is written in TypeScript with a test suite. This doesn't affect end users directly, but it means bugs are caught earlier and the code is easier to maintain.

### What Undiscord Does Better

**Visual Message Picker**
Undiscord lets you click on messages in Discord to visually select the date range boundaries. This is genuinely useful when you want to delete "everything before that message" without hunting for dates.

**Archive Import**
If you've requested your data from Discord (Settings → Privacy → Request Data), Undiscord can import the `index.json` to help you find and delete messages across all your channels. Detcord doesn't support this yet.

**Community & Track Record**
Undiscord has been around longer and has a larger user base. More people have tested it in more situations.

---

## Detcord vs Deleo

[Deleo](https://github.com/notsapinho/deleo) is a command-line tool for deleting Discord messages.

### Differences

| Feature | Detcord | Deleo |
|---------|---------|-------|
| Platform | Browser (userscript) | Terminal (CLI) |
| Date filtering | Yes | No |
| Content filtering | Yes | No |
| Regex patterns | Yes | No |
| Visual interface | Yes | No |
| Preview before delete | Yes | No |
| Token setup | Automatic | Manual |

**When to use Deleo:**
- You're comfortable with command-line tools
- You want to script or automate deletion
- You don't need filtering options

**When to use Detcord:**
- You want to see what you're deleting before it's gone
- You need to filter by date, content, or other criteria
- You prefer a visual interface

---

## Detcord vs MesDel

[MesDel](https://github.com/Umit-Ulusoy/mesdel) is a Chrome extension focused on DM deletion.

### Differences

| Feature | Detcord | MesDel |
|---------|---------|--------|
| Delete from servers | Yes | No |
| Delete from channels | Yes | No |
| Delete from DMs | Yes | Yes |
| Filtering options | Yes | No |
| Browser support | All major browsers | Chrome only |

MesDel is designed for a narrower use case. If you only need to clear DMs and want a native Chrome extension, it may work for you. For anything else, Detcord offers more flexibility.

---

## Common Features

All of these tools share some baseline capabilities:

- Delete your own messages only (Discord API limitation)
- Respect rate limits (required to avoid account issues)
- Work without storing your credentials externally
- Free and open source

---

## Limitations

**None of these tools can:**
- Delete other people's messages
- Delete messages faster than Discord allows
- Guarantee Discord won't detect automated usage
- Work in the Discord desktop app (browser only)

---

## Our Honest Assessment

If you need proven reliability and don't mind a slightly older interface, **Undiscord** is a solid choice—it's popular for good reason.

If you want a cleaner experience with better rate limit handling and session resume, **Detcord** is what we're building toward.

We're not trying to claim Detcord is better in every way. We're trying to build a tool that's reliable, maintainable, and respects your time. If Undiscord's visual message picker or archive import features are important to you, use Undiscord. We might add those features eventually, but we'd rather be honest about what we offer today.

---

*Last updated: December 2024*
