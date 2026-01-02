# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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
