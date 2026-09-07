# Changelog

All notable changes to this project are documented here.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.0.0/) and [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.1.0] - Unreleased

### Fixed

- Restored release packaging so `detcord.user.js` is attached to every release and the permanent install URL no longer returns 404.
- Made resume work through Discord's storage restrictions instead of presenting an unusable v1.0.x progress record.
- Prevented newest-first runs from looping on the same page when pinned, regex, or message-type filters exclude results, and made those runs reach messages beyond the first page.
- Kept preview and deletion on the same selected channel in Specific mode.
- Deleted from every selected channel instead of only the first channel.
- Made Last 24 hours use an exact rolling 24-hour boundary instead of matching up to 48 hours.
- Blocked confirmation until preview has completed successfully.
- Cancelled the countdown when the Detcord window is closed.
- Prevented double-clicks from starting two deletion runs.
- Preserved all filters when a search is retried.
- Marked failed, skipped, and already-gone messages accurately in the progress feed and final counts.
- Bound a manually entered token to its Discord account before using saved progress or deleting messages.
- Closed a path that allowed an unsafe regular expression to bypass validation.
- Stopped oldest-first discovery from swallowing API errors; the mode is hidden while it is redesigned.
- Made Stop interrupt search, delete, indexing, backoff, and oldest-first discovery waits promptly.
- Treated unauthorised responses as fatal, forbidden archived-thread responses as skipped, and missing messages as already gone.

### Changed

- Represented every Discord API failure as a typed error with status, retry delay, global scope, and Discord error code where available.
- Smoothed throttling by adding 50% of the observed gap after a 429 and reducing the delay by 10% after five clean deletions.
- Honoured exhausted rate-limit buckets before the next request and waited for temporary 202 indexing responses.
- Corrected empty-page retries to 10, 13, 16.9, 22, and 28.6 seconds.
- Kept the default pacing at 10 seconds between searches and 1 second between deletions.
- Updated the toolchain to Vite 8, Vitest 5, Biome 2.5, TypeScript 7, jsdom 30, and Node.js 24 in CI.
- Raised the supported Node.js version to 22.12 or later.
- Moved repository, support, and security links to `canaryframe/detcord`.
- Changed releases to a tag-driven pipeline that verifies the userscript asset before publication.

### Added

- Added version 2 resumable sessions, saved every 10 deletions and on Stop, with a 24-hour expiry and an on-open resume prompt.
- Added separate deleted, already-gone, skipped, and failed outcomes to progress and completion reporting.
- Added account and target namespacing for saved progress.
- Added Chromium installation guidance for the required Developer mode and Allow user scripts settings.
- Added a Contributor Covenant 2.1 code of conduct.

### Security

- Enforced the regular-expression guard on every preview and deletion path.
- Verified manually entered tokens against Discord's current-user endpoint.
- Added a final ownership check before each delete request.
- Prevented a closed countdown from starting an unseen deletion run.
- Required a successful preview before destructive confirmation.

### Removed

- Hid oldest-first deletion pending a safer cursor redesign.
- Removed Husky; Conventional Commit messages are checked in CI.

## [1.0.2] - 2026-01-25

### Fixed

- Fixed an infinite loop when messages failed to delete because of thread or permission errors.
- Skipped past blocked messages with `max_id` instead of ending after an undeletable first batch.
- Fixed early termination caused by comparing remaining and processed message counts incorrectly.

### Added

- Tracked permanently failed messages separately.
- Added a skipped-message counter.
- Skipped messages whose returned channel did not match the deletion target.

## [1.0.1] - 2026-01-04

### Changed

- Updated Biome, Vite, Vitest, jsdom, Commitlint, and Node.js type definitions.

### Fixed

- Addressed CodeQL findings.
- Removed `ts-prune` to resolve a transitive YAML conflict.

### Added

- Added Dependabot configuration.

## [1.0.0] - 2026-01-02

### Added

- Added bulk deletion with configurable delays and rate-limit handling.
- Added Discord message search and deletion API support.
- Added automatic token extraction.
- Added date, content, attachment, link, regex, and pinned-message filters.
- Added preview and estimated-duration reporting.
- Added the initial progress-persistence implementation.
- Added countdown, progress, completion, and visual-effect screens.
- Added the wizard interface.
- Added automated tests and coverage reporting.

### Security

- Kept tokens out of persistent storage.
- Escaped user content before HTML rendering.
- Limited runtime network requests to Discord.
