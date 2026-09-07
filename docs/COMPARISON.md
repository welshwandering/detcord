# Detcord and other Discord deletion tools

No Discord message-deletion tool can bypass Discord's API rules. Choose based on the workflow and safeguards you need, not a claim that one project is universally better.

## Detcord and Undiscord

[Undiscord](https://github.com/victornpb/undiscord) is an established userscript with 6,652 GitHub stars at the time of this update. It is still maintained; its latest recorded push was in December 2025.

| Capability | Detcord 1.1.0 | Undiscord |
| --- | --- | --- |
| Browser userscript | Yes | Yes |
| Delete only the signed-in user's messages | Yes | Yes |
| Preview before deletion | Yes | Yes |
| Date and content filters | Yes | Yes |
| Visual message picking | No | Yes |
| Discord archive import | No | Yes |
| Resume after closing the browser | Yes, for 24 hours | Start a new run |
| Adaptive deletion delay | Yes | Handles Discord rate limits with its own strategy |
| Delete from archived threads | No | No |

Star counts and project activity change. Check each repository before installing.

### Where Detcord differs

#### Resume

Detcord 1.1.0 saves progress every 10 deletions and on Stop. On the next open, it can restore the target, filters, cursor, and counters for the same Discord account. Saved sessions expire after 24 hours. Resume did not work in Detcord 1.0.x.

#### Adaptive throttling

Detcord starts with a 1-second deletion delay. After a 429 response it waits for Discord's `retry_after` and adds 50% of the observed gap to the delay. After five clean deletions it reduces that delay by 10%. It also waits before the next request when Discord reports `X-RateLimit-Remaining: 0`.

#### Empty search pages

Discord's search index can lag behind deletion. Detcord retries an empty page five times with a 1.3 multiplier: 10 seconds, 13 seconds, 16.9 seconds, 22 seconds, and 28.6 seconds.

#### Guided review

Detcord uses a target, filters, preview, and confirmation sequence. The same run configuration is carried from preview into deletion.

### Where Undiscord differs

#### Visual message picker

Undiscord can use messages visible in Discord as range boundaries. This is useful when the desired boundary is easier to recognise than to express as a date.

#### Archive import

Undiscord can use Discord data-export information to locate messages across channels. Detcord does not import Discord archives.

#### Track record

Undiscord has a larger user base and a longer public history. Detcord's TypeScript implementation and automated tests are engineering choices, not evidence that it is safer or more reliable in every environment.

## Shared limitations

Both tools are constrained by Discord:

- They can delete only the signed-in user's own messages.
- They cannot delete messages in archived threads.
- They cannot exceed Discord's rate limits safely.
- They depend on undocumented parts of Discord's web application.
- They cannot guarantee that Discord will not detect automated use.
- They run in a browser, not the Discord desktop app.

## Choosing

Use Undiscord if visual message selection, archive import, or its longer track record matters most. Use Detcord if you prefer its guided preview, 24-hour resume, selected-channel workflow, and adaptive pacing.

Last updated: September 2026.
