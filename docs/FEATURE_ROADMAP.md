# Feature roadmap

This roadmap records shipped behaviour and the next planned user-facing work. It is not a release guarantee.

## Shipped in 1.1.0

| Feature | Status | Notes |
| --- | --- | --- |
| Resume | Shipped | Progress is saved every 10 deletions and on Stop, expires after 24 hours, and can be resumed by the same account. The v1.0.x implementation stored data but never restored a working run. |
| Multi-channel Specific mode | Shipped | Preview and deletion retain all selected channels. |
| Exact time presets | Shipped | Rolling presets use exact timestamps, including a true last 24 hours. |
| Adaptive throttling | Shipped | Discord retry timing, proactive bucket exhaustion, and gradual recovery are honoured. |
| Typed API errors | Shipped | Authentication, indexing, forbidden, missing, network, and server failures have distinct outcomes. |
| Interruptible Stop | Shipped | Stop cancels active waits and saves progress. |
| Safe confirmation | Shipped | Preview must complete before deletion can begin; the commit action uses hold-to-confirm or a reduced-motion two-step alternative. |

## Design system

- [PRODUCT.md](../PRODUCT.md) records the audience, purpose, context, constraints, voice, and evidence behind product decisions.
- [DESIGN.md](../DESIGN.md) records the visual system, interaction rules, accessibility requirements, and component contract.
- UI work follows the pbakaus/impeccable practice under Apache 2.0: run `critique`, `audit`, and `polish` before changes ship.

## Motion budget

| Motion | Budget | Status |
| --- | --- | --- |
| Hold-to-confirm fill | 1.5 seconds | Required; the single authored motion moment. |
| Step transitions | Exponential ease-out, no more than 240ms | Permitted; use View Transitions where supported. |
| Other state changes | Exponential ease-out, no more than 240ms | Permitted only when motion clarifies the change. |
| Reduced motion | No hold fill or decorative transition | Required; use a plain two-step confirmation. |
| Message shatter | None | Not planned. |
| Button ripple | None | Not planned. |

## Hidden pending redesign

### Oldest-first deletion

Oldest-first mode is hidden in 1.1.0. Its discovery phase previously swallowed errors and was difficult to stop reliably. It will return only with a cursor design that preserves filters, propagates typed failures, and remains interruptible.

## Planned for 1.2

### Dry-run mode

Run the complete target, search, and filter path without issuing delete requests. The result should provide a reviewable list and the same outcome summary shape used by a real run.

### Message export

Export matched messages before deletion in a documented JSON format, with an optional plain-text form. Attachment URLs may be included, but Detcord will not download or re-host attachments.

### Accessibility review

Complete keyboard, screen-reader, focus, contrast, live-region, and reduced-motion testing in both themes across supported browsers.

Dry run and export are the next planned differentiators. Both need clear memory limits for large histories and explicit handling of private message content.

## Later candidates

| Feature | Reason to consider it |
| --- | --- |
| Visual message picker | Set date or snowflake boundaries directly from visible Discord messages. |
| Discord archive import | Locate channels and messages from a user's Discord data export. |
| Saved filter presets | Reuse named filter combinations without storing credentials. |
| Large-run confirmation | Require stronger confirmation for unusually large deletion scopes. |
| Completion notification | Notify the user when a long visible-tab run finishes. |

## Non-goals

- Bot functionality
- Bulk DM sending or other spam features
- Deleting another user's messages
- Bypassing Discord's rate limits
- A Discord desktop-app integration
- Message editing
- Persistent token storage
- Uploading message content or tokens to a third-party service

Last updated: September 2026.
