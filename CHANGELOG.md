# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.0.2] - 2026-01-25

### Fixed

- Fix infinite loop when messages fail to delete (403 errors from threads, permissions, etc.)
- Fix premature exit when first batch of messages are undeletable - now skips past blocked messages using maxId
- Fix early termination at ~50% progress due to incorrect comparison of remaining vs processed message counts

### Added

- Track permanently failed messages separately to detect when all remaining messages are undeletable
- Add `skippedCount` to deletion state for tracking messages that cannot be deleted
- Proactive thread detection - skip messages with mismatched channel_id before attempting deletion

## [1.0.1] - 2026-01-04

### Changed

- Update @biomejs/biome from 1.9.4 to 2.3.11 with config migration
- Update vite from 6.4.1 to 7.3.0
- Update vitest from 3.x to 4.x with coverage threshold adjustments
- Update jsdom from 25.0.1 to 27.4.0
- Update @commitlint/cli from 19.8.1 to 20.3.0
- Update @types/node from 22.19.3 to 25.0.3

### Fixed

- Address CodeQL security scanning issues
- Remove ts-prune to resolve yaml version conflict

### Added

- Dependabot configuration for automated dependency updates

## [1.0.0] - 2026-01-02

### Added

- **Core Deletion Engine**: Bulk message deletion with configurable delays and rate limit handling
- **Discord API Client**: Full integration with Discord's search and delete APIs
- **Token Extraction**: Automatic authentication token detection via localStorage and webpack
- **Message Filtering**: Filter by date range, content pattern, message type, and pinned status
- **Preview Screen**: Scan and preview messages before deletion with estimated time
- **Progress Persistence**: Save/resume deletion progress via localStorage
- **Countdown Animation**: 3-2-1-BOOM sequence before deletion starts
- **Visual Effects**: Confetti celebration on completion, rotating status messages
- **Wizard-based UI**: Multi-screen interface with clear navigation
- **Rate Limit Recovery**: Smooth backoff and recovery from API throttling
- **Comprehensive Test Suite**: 315+ tests with >80% coverage

### Security

- Tokens are never stored persistently
- All user content is HTML-escaped to prevent XSS
- Runs entirely in browser - no external requests except to Discord API
