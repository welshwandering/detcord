# Detcord Developer Documentation

This document describes the architecture and engineering rules for Detcord.

---

## Important disclaimers

> **Detcord is independent and is not affiliated with, endorsed by, or connected to Discord Inc.**

> **Discord can change its API at any time, which may break Detcord without notice.**

> **This software is provided as-is, without warranty.**

---

## Project overview

Detcord is a browser userscript for bulk deletion of a user's own Discord messages.

### Key technical constraints

- **Browser-only execution**: Detcord runs through Tampermonkey or Violentmonkey.
- **Single-file distribution**: Production builds emit one installable userscript.
- **No persistent credentials**: Tokens are never written to storage.
- **Discord-only network access**: Runtime requests go only to `discord.com`.
- **Rate-limit compliance**: Discord's retry and bucket information must be honoured.
- **Own messages only**: Discord's API allows users to delete only their own messages.

---

## Project structure

```text
detcord/
├── .github/
│   ├── ISSUE_TEMPLATE/
│   └── workflows/
│       ├── ci.yml
│       └── release.yml
├── docs/
│   ├── COMPARISON.md
│   ├── FEATURE_ROADMAP.md
│   └── RELEASE_RUNBOOK.md
├── scripts/
├── src/
│   ├── core/
│   │   ├── deletion-engine.ts
│   │   ├── discord-api.ts
│   │   ├── errors.ts
│   │   ├── persistence.ts
│   │   ├── storage.ts
│   │   └── token.ts
│   ├── ui/
│   │   ├── channel-picker.ts
│   │   ├── constants.ts
│   │   ├── controller.ts
│   │   ├── effects.ts
│   │   ├── identity.ts
│   │   ├── ports.ts
│   │   ├── progress-view.ts
│   │   ├── resume.ts
│   │   ├── review-view.ts
│   │   ├── run-config.ts
│   │   ├── runner.ts
│   │   ├── templates.ts
│   │   ├── window-chrome.ts
│   │   ├── window-markup.ts
│   │   ├── window-styles.ts
│   │   └── wizard.ts
│   ├── utils/
│   │   ├── helpers.ts
│   │   ├── performance.ts
│   │   └── validators.ts
│   └── index.ts
├── dist/
│   └── detcord.user.js
├── CHANGELOG.md
├── CONTRIBUTING.md
├── SECURITY.md
└── package.json
```

Tests are co-located with their source files.

The UI is split by responsibility: `controller.ts` (mount, event delegation, wizard navigation, the confirmation gate), `wizard.ts` (form state and the state/DOM reset pair), `run-config.ts` (the immutable `RunConfig` that preview and deletion share), `runner.ts` (the single owned engine and sequential multi-channel runs), `progress-view.ts` and `review-view.ts` (rendering), `channel-picker.ts`, `identity.ts` (token binding through `/users/@me`), `resume.ts`, `window-chrome.ts` (dragging and the minimised indicator), `window-markup.ts` and `window-styles.ts` (static template and CSS), `ports.ts` (UI-side interfaces onto the core, used for test injection), `constants.ts`, `effects.ts` and `templates.ts`.

---

## Architecture

### Core modules

#### `discord-api.ts`

`DiscordApiClient` owns authenticated requests to Discord:

- Search through guild or channel message-search endpoints.
- Delete through the channel message endpoint.
- Resolve the current account through `/users/@me`.
- Load guild channels for target selection.
- Capture rate-limit headers for proactive pacing.
- Convert every API failure into `DiscordApiError`.

Repeated search `has` filters are encoded by calling `URLSearchParams.append` once per value.

#### `errors.ts`

`DiscordApiError` is the only API failure shape used by the client and engine. Its codes are:

- `RATE_LIMITED`
- `INDEXING`
- `UNAUTHORIZED`
- `FORBIDDEN`
- `NOT_FOUND`
- `NETWORK_ERROR`
- `SERVER_ERROR`
- `UNKNOWN`

It carries HTTP status, retry delay, global-rate-limit state, Discord error code, and an optional cause. `RATE_LIMITED`, `INDEXING`, `NETWORK_ERROR`, and `SERVER_ERROR` are retryable. Discord code 50083 identifies an archived thread.

#### `deletion-engine.ts`

`DeletionEngine` owns preview, deletion, cursor movement, pause, Stop, retries, persistence checkpoints, and outcome counters.

The engine reports each message as `deleted`, `already_gone`, `skipped`, or `failed`. Completion reports whether the run completed, was stopped, or ended in an error.

#### `storage.ts`

Discord removes `window.localStorage` from its own page. `getPageStorage()` must:

1. Use `window.localStorage` when it is available and usable.
2. Otherwise create a hidden same-origin iframe and use the frame's storage.
3. Return `null` if neither store is available.
4. Cache the resolved storage until `resetPageStorage()` removes the cache and iframe.

Only progress is stored. Tokens must never be written to either storage path.

#### `persistence.ts`

Persistence uses schema version 2 and the key:

```text
detcord_progress:v2:<authorId>:<targetKey>
```

The target key is derived from the guild or channel target. Records include the author, target, deletion order, monotonic cursor, counters, timestamp, and active filters.

Progress is saved every 10 deletions and on Stop. Records expire after 24 hours. Resume selects the newest valid record for the current author. Legacy `detcord_progress` version 1 data is deleted when encountered.

#### `token.ts`

Token extraction is webpack-first. It must not dispatch synthetic browser events, log a token, or persist a token. A manual token is not trusted until `getCurrentUser()` binds it to the Discord account that supplied it.

### UI modules

The UI owns the target, filter, review, countdown, progress, resume, completion, and error screens. It translates user selections into one immutable run configuration, then passes that configuration to preview and deletion.

Important invariants:

- Preview and deletion use the same target and filters.
- Confirmation remains disabled until preview succeeds.
- Specific mode preserves every selected channel.
- A second click cannot start a second run.
- Closing the window cancels the countdown.
- Stop interrupts engine waits and persists the resumable state.
- Failed and skipped outcomes are never rendered as successful deletions.
- Oldest-first controls remain hidden until that mode is redesigned.

### Utility modules

- `helpers.ts`: snowflake conversion, formatting, escaping, query construction, delays, and clamps.
- `performance.ts`: throttling, batching, bounded collections, observer control, and cleanup.
- `validators.ts`: snowflake, token, and regular-expression validation.

### Data flow

```text
User action
    |
    v
UI wizard and preview
    |
    v
DeletionEngine
    |
    v
DiscordApiClient
    |
    v
Discord API
```

---

## Cursor and pagination rules

Newest-first deletion uses a monotonic `max_id` cursor. It does not page by search offset.

After each batch, move `max_id` strictly older than the oldest message considered in that batch. The cursor must advance even when messages are pinned, filtered out, already gone, forbidden, or otherwise not deleted. Retrying a search must preserve every configured filter.

This design avoids Discord's shifting search index and prevents the same newest page from being returned indefinitely. Do not reintroduce offset paging for newest-first runs.

Oldest-first mode is hidden pending redesign. Code that remains for discovery must propagate typed errors and respond to Stop.

---

## Error and rate-limit rules

Every failed request must throw `DiscordApiError`.

- **429**: Retry after Discord's `retry_after`. Prefer JSON, then `X-RateLimit-Reset-After`, then `Retry-After`.
- **202 search response**: Treat as `INDEXING`, wait, and retry.
- **401**: Stop the run with an authentication error.
- **403**: Skip the message and report the reason. Code 50083 is an archived thread.
- **404 delete response**: Return `already_gone`.
- **Fetch rejection**: Throw `NETWORK_ERROR` with the original cause.
- **5xx**: Throw `SERVER_ERROR`; the engine may retry it.

When `X-RateLimit-Remaining` reaches zero, wait for the reset before issuing another request.

Deletion pacing starts at 1 second. A throttle adds 50% of the observed gap to the delay. After five clean deletions, reduce the current delay by 10%. Search pacing remains 10 seconds by default.

Empty search pages use a 1.3 multiplier for five retries: 10 seconds, 13 seconds, 16.9 seconds, 22 seconds, and 28.6 seconds. Stop must abort these waits promptly through an `AbortController`.

---

## Build instructions

### Prerequisites

- Node.js 22.12 or later
- Node.js 24 recommended and used in CI
- npm

### Setup

```bash
git clone https://github.com/canaryframe/detcord.git
cd detcord
npm install
npm run typecheck
npm run lint
npm run test
```

### Commands

```bash
npm run dev
npm run build
npm run build:userscript
npm run test
npm run test:watch
npm run test:coverage
npm run lint
npm run lint:fix
npm run format
npm run typecheck
```

The installable output is `dist/detcord.user.js`.

---

## Testing

Tests use Vitest 5 with jsdom 30. CI runs tests on every pull request and reports coverage.

### Conventions

- Co-locate `*.test.ts` with the module under test.
- Stub `fetch`; never call Discord from a test.
- Do not mock response or error shapes that `DiscordApiClient` cannot produce.
- Throw real `DiscordApiError` instances from API-client doubles.
- Cover cancellation during waits, not only cancellation between requests.
- Use fake timers for pacing tests and restore them after each test.
- Reset page-storage caches and remove iframe fixtures between tests.
- Assert that retry paths preserve target and filter options.
- Add a regression test that fails against the previous behaviour for every fix.

Run the complete validation set before review:

```bash
npm run typecheck
npm run lint
npx vitest run --coverage
npm run build:userscript
```

---

## Code style

- TypeScript 7 in strict mode
- `exactOptionalPropertyTypes` enabled
- `noUncheckedIndexedAccess` enabled
- Biome 2.5 for formatting and linting
- Two spaces for indentation
- Single quotes
- Semicolons
- No explicit `any`
- JSDoc on exported functions
- Cognitive complexity no higher than 15

Prefer shared helpers and typed guards over assertions. Surface errors through the existing callback and UI patterns rather than swallowing them.

---

## Performance considerations

### Browser work

- Batch DOM updates.
- Keep progress feeds bounded.
- Clean up listeners, observers, animation frames, timers, and iframes.
- Avoid retaining message bodies after they are no longer needed.
- Keep the main thread responsive during large runs.

Chromium throttles timers in tabs hidden for more than five minutes. This is a browser limitation; background runs continue more slowly.

### API work

- Fetch full search pages.
- Filter locally only when Discord cannot express the filter.
- Keep the newest-first cursor monotonic.
- Honour proactive and reactive rate-limit waits.
- Stop promptly when the user requests it.

---

## Security considerations

See [SECURITY.md](SECURITY.md).

### Required controls

1. Never log, persist, or display a full token.
2. Never send a token or Discord content to a third party.
3. Bind manual tokens to `/users/@me`.
4. Verify message ownership immediately before deletion.
5. Escape user-controlled content.
6. Validate every regex entry path with `validateRegex`.
7. Validate saved progress before restoring it.
8. Require a successful preview before confirmation.
9. Cancel delayed actions when their UI is closed.

---

## Contributing

Follow [CONTRIBUTING.md](CONTRIBUTING.md) and [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md). Use GitHub Issues for questions and proposals; Discussions is disabled.

Commit messages follow Conventional Commits and are checked in CI.

---

## Debugging

### Token extraction

- Confirm Discord's webpack chunk and token-manager shape.
- Confirm no token reaches logs or storage.
- Verify manual entry through `/users/@me`.

### Rate limiting

- Inspect the typed error code and retry source.
- Check `X-RateLimit-Remaining`, reset timing, and global scope.
- Confirm the adaptive delay changes only at the defined thresholds.

### Search loops

- Record successive `max_id` values.
- Confirm each cursor is strictly older.
- Check that pinned, filtered, skipped, and failed messages still advance the cursor.

### Resume

- Check the version 2 key, author ID, target key, expiry, filters, cursor, and counters.
- Confirm a resumed `start()` preserves restored counters instead of resetting them.

---

## Release process

Releases are tag-driven.

1. Update `CHANGELOG.md`.
2. Run the full validation set.
3. Run signed `npm version patch`, `npm version minor`, or `npm version major`.
4. Push the version commit and tag.
5. CI runs lint, type checking, tests, coverage, and the userscript build.
6. The release job uploads `detcord.user.js` and fails if the asset is missing.
7. Verify the permanent download URL after publication.

See [docs/RELEASE_RUNBOOK.md](docs/RELEASE_RUNBOOK.md) for commands, hotfixes, and immutable-release recovery.

---

## Resources

- [Discord API documentation](https://discord.com/developers/docs)
- [Tampermonkey documentation](https://www.tampermonkey.net/documentation.php)
- [Vite documentation](https://vite.dev/)
- [Vitest documentation](https://vitest.dev/)
- [Biome documentation](https://biomejs.dev/)
- [TypeScript documentation](https://www.typescriptlang.org/docs/)
