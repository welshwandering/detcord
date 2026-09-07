# Detcord Developer Documentation

This document provides technical guidance for developers working on Detcord.

---

## Important Disclaimers

> **This project is independent and is NOT affiliated with, endorsed by, or connected to Discord Inc.**

> **Discord may change their API at any time, which could break this tool without notice.**

> **This software is provided AS-IS without warranty.**

---

## Project Overview

Detcord is a browser userscript for bulk deletion of a user's own Discord messages.

### Key Technical Constraints

- **Browser-only execution** - Runs as a Tampermonkey/Violentmonkey/Greasemonkey userscript
- **No external dependencies** - All code is bundled into a single file
- **No persistent storage of credentials** - Tokens are never saved
- **Rate limit compliance** - Must respect Discord's API throttling
- **Own messages only** - Discord's API only allows deletion of user's own messages

---

## Project Structure

```
detcord/
├── src/
│   ├── core/                    # Core business logic
│   │   ├── index.ts             # Core module exports
│   │   ├── discord-api.ts       # Discord API client
│   │   ├── discord-api.test.ts  # API client tests
│   │   ├── token.ts             # Token extraction utilities
│   │   ├── token.test.ts        # Token extraction tests
│   │   ├── deletion-engine.ts   # Orchestrates bulk deletion
│   │   ├── deletion-engine.test.ts # Deletion engine tests
│   │   ├── persistence.ts       # Session persistence utilities
│   │   ├── persistence.test.ts  # Persistence tests
│   │   └── types.ts             # Shared type definitions
│   ├── ui/                      # User interface layer
│   │   ├── index.ts             # UI module exports
│   │   ├── controller.ts        # Main UI controller (wizard interface)
│   │   ├── controller.test.ts   # Controller tests
│   │   ├── templates.ts         # DOM element creation
│   │   ├── templates.test.ts    # Template tests
│   │   ├── effects.ts           # Visual effects (confetti, countdown)
│   │   ├── effects.test.ts      # Effects tests
│   │   └── styles.ts            # CSS styles
│   ├── utils/                   # Utility functions
│   │   ├── index.ts             # Utils module exports
│   │   ├── helpers.ts           # General helpers (snowflake, formatting)
│   │   ├── helpers.test.ts      # Helper tests
│   │   ├── validators.ts        # Input validation utilities
│   │   ├── validators.test.ts   # Validator tests
│   │   ├── performance.ts       # Performance optimization utilities
│   │   └── performance.test.ts  # Performance utility tests
│   ├── index.ts                 # Entry point with auto-initialization
│   └── index.test.ts            # Entry point tests
├── dist/                        # Build output
│   └── detcord.user.js          # Generated userscript
├── biome.json                   # Biome linter/formatter config
├── tsconfig.json                # TypeScript configuration
├── vite.config.ts               # Vite build configuration
├── vitest.config.ts             # Vitest test configuration
├── package.json                 # Project dependencies
├── CONTRIBUTING.md              # Contribution guidelines
├── SECURITY.md                  # Security policy
├── CHANGELOG.md                 # Version history
└── LICENSE                      # MIT License
```

---

## Architecture

### Module Overview

#### Core Modules (`src/core/`)

**`discord-api.ts`** - Discord API Client
- Provides `DiscordApiClient` class for authenticated API requests
- Handles message search via `/api/v10/guilds/{id}/messages/search` and `/api/v10/channels/{id}/messages/search`
- Handles message deletion via `DELETE /api/v10/channels/{id}/messages/{id}`
- Extracts and tracks rate limit headers (`X-RateLimit-*`)
- Returns structured error types for different failure modes

**`token.ts`** - Token Extraction
- `getToken()` - Primary method, tries all extraction strategies
- `getTokenFromLocalStorage()` - Extracts token via iframe localStorage access
- `getTokenFromWebpack()` - Extracts token via webpack module introspection
- `getAuthorId()` - Gets current user's ID for filtering
- `getGuildIdFromUrl()` / `getChannelIdFromUrl()` - URL parsing utilities

**`deletion-engine.ts`** - Deletion Orchestration
- `DeletionEngine` class manages the full deletion lifecycle
- Configurable via `configure()` with filter options
- Event callbacks via `setCallbacks()` for progress updates
- State machine: idle -> running -> (paused) -> stopped
- Handles pagination, retries, and rate limit backoff
- Filters messages by type, content pattern, and pinned status

**`types.ts`** - Type Definitions
- Discord API response types (`DiscordMessage`, `SearchResponse`, etc.)
- Engine configuration types (`DeletionOptions`, `DeletionState`, etc.)
- Callback signatures for lifecycle events

**`persistence.ts`** - Session Persistence
- `saveProgress()` / `loadProgress()` - Persist deletion progress
- 24-hour expiry for saved sessions
- Runtime validation of saved data
- Corruption detection and cleanup

#### UI Modules (`src/ui/`)

**`controller.ts`** - Main UI Controller
- `DetcordUI` class manages the wizard interface
- Multi-screen flow (main menu → target → filters → preview → deletion)
- Progress tracking with real-time updates
- Pause/resume/stop controls
- Event-driven with callbacks for engine integration

**`templates.ts`** - DOM Element Creation
- Creates all UI elements (buttons, inputs, modals)
- Preview screen rendering
- Status message templates
- Uses `escapeHtml()` for XSS prevention

**`effects.ts`** - Visual Effects
- Confetti animation on completion
- Countdown sequence (3-2-1-BOOM)
- Status message rotator with humorous messages
- Shake and flash animations

**`styles.ts`** - CSS Styles
- Comprehensive CSS for wizard UI
- Dark theme optimized for Discord
- Responsive design for various screen sizes

#### Utility Modules (`src/utils/`)

**`helpers.ts`** - General Utilities
- `dateToSnowflake()` / `snowflakeToDate()` - Discord snowflake ID conversion
- `formatDuration()` - Human-readable time formatting
- `escapeHtml()` - XSS prevention for UI rendering
- `buildQueryString()` - URL query parameter encoding
- `delay()` - Promise-based sleep
- `clamp()` - Numeric value clamping

**`performance.ts`** - Performance Utilities
- `throttle()` / `debounce()` - Rate limiting for functions
- `createBatchUpdater()` - Batched DOM updates via requestAnimationFrame
- `createBoundedArray()` - Fixed-size arrays to prevent memory leaks
- `createCleanupManager()` - Resource cleanup tracking
- `appendMany()` / `trimChildren()` - Efficient DOM manipulation
- `createOptimizedObserver()` - Throttled MutationObserver wrapper

**`validators.ts`** - Input Validation
- `validateRegex()` - Regex pattern validation (prevents ReDoS)
- `isValidSnowflake()` - Discord snowflake ID validation
- `isValidTokenFormat()` - Token format checking
- `sanitizeId()` - ID sanitization for API requests

### Data Flow

```
User Action
    │
    ▼
┌─────────────────┐
│   UI Layer      │  (src/ui/)
│   - Wizard UI   │
│   - Progress UI │
│   - Effects     │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ DeletionEngine  │
│   - configure() │
│   - start()     │
│   - pause()     │
│   - stop()      │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ DiscordApiClient│
│   - search()    │
│   - delete()    │
└────────┬────────┘
         │
         ▼
   Discord API
```

---

## Build Instructions

### Prerequisites

- Node.js 18 or later
- npm (comes with Node.js)

### Development Setup

```bash
# Clone the repository
git clone https://github.com/welshwandering/detcord.git
cd detcord

# Install dependencies
npm install

# Run linter
npm run lint

# Run tests
npm run test

# Type checking
npm run typecheck
```

### Build Commands

```bash
# Development build (ES modules + IIFE, with sourcemaps)
npm run build

# Userscript build (single IIFE file with userscript header)
npm run build:userscript

# Development server (for local testing)
npm run dev
```

### Output

- `dist/detcord.user.js` - Userscript for installation in Tampermonkey/etc.
- `dist/detcord.es.js` - ES module build (development)
- `dist/detcord.iife.js` - IIFE build (development)

---

## Testing

### Test Framework

Tests use [Vitest](https://vitest.dev/) with jsdom for browser API simulation.

### Running Tests

```bash
# Run all tests once
npm run test

# Watch mode (re-run on file changes)
npm run test:watch

# With coverage report
npm run test:coverage
```

### Test Structure

Tests are co-located with their source files:
- `src/index.test.ts`
- `src/core/discord-api.test.ts`
- `src/core/token.test.ts`
- `src/core/deletion-engine.test.ts`
- `src/core/persistence.test.ts`
- `src/ui/controller.test.ts`
- `src/ui/templates.test.ts`
- `src/ui/effects.test.ts`
- `src/utils/helpers.test.ts`
- `src/utils/validators.test.ts`
- `src/utils/performance.test.ts`

### Coverage Requirements

Target: **>80% code coverage**

Coverage is measured using V8 coverage via `@vitest/coverage-v8`.

### Writing Tests

```typescript
import { describe, it, expect, vi } from 'vitest';
import { myFunction } from './my-module';

describe('myFunction', () => {
    it('should handle normal input', () => {
        expect(myFunction('test')).toBe('expected');
    });

    it('should throw on invalid input', () => {
        expect(() => myFunction(null)).toThrow();
    });
});
```

---

## Code Style

### Language and Tooling

- **TypeScript** in strict mode
- **Biome** for linting and formatting
- **Tabs** for indentation (2-space width)
- **Single quotes** for strings
- **Semicolons** required

### Biome Configuration

Key rules enforced:
- `noExplicitAny: error` - No `any` types allowed
- `useConst: error` - Use `const` for non-reassigned variables
- `noExcessiveCognitiveComplexity: warn` - Max complexity of 15

### Running Linter

```bash
# Check for issues
npm run lint

# Auto-fix issues
npm run lint:fix

# Format only
npm run format
```

### Code Conventions

1. **Use descriptive names** - Avoid abbreviations
2. **Document public APIs** - JSDoc comments for exported functions
3. **Handle errors explicitly** - No swallowed exceptions
4. **Avoid magic numbers** - Use named constants
5. **Keep functions focused** - Single responsibility principle

---

## Performance Considerations

### Browser Performance

The userscript runs inside Discord's web app, which is already resource-intensive. Performance is critical.

1. **Minimize DOM operations**
   - Batch updates using `createBatchUpdater()`
   - Use DocumentFragment for multiple insertions
   - Avoid layout thrashing (read-then-write pattern)

2. **Memory management**
   - Use `createBoundedArray()` for log entries
   - Clean up event listeners with `createCleanupManager()`
   - Avoid closures that capture large objects

3. **Throttle expensive operations**
   - UI updates: throttle to ~60fps maximum
   - Log rendering: batch append, trim old entries
   - Progress callbacks: throttle to prevent UI jank

4. **Async operation management**
   - Never block the main thread
   - Use `requestAnimationFrame` for visual updates
   - Respect rate limits to avoid API throttling

### API Performance

1. **Respect rate limits**
   - Default 10 second delay between search requests
   - Default 1 second delay between delete requests
   - Honor `X-RateLimit-Reset-After` header
   - Exponential backoff on 429 responses

2. **Minimize requests**
   - Fetch full pages (25 messages per search)
   - Filter client-side when possible
   - Stop early if no more results

---

## Security Considerations

See [SECURITY.md](SECURITY.md) for the full security policy.

### Key Security Requirements

1. **Token handling**
   - Never log tokens to console
   - Never store tokens persistently
   - Never transmit tokens to third parties
   - Mask tokens in any UI display

2. **User input**
   - Escape all HTML to prevent XSS (`escapeHtml()`)
   - Validate regex patterns to prevent ReDoS
   - Sanitize IDs before use in API requests

3. **API requests**
   - Only make requests to `discord.com`
   - Verify response types before processing
   - Handle errors gracefully without exposing internals

---

## Contributing

### Pull Request Process

1. Fork the repository
2. Create a feature branch
3. Write tests for new functionality
4. Ensure all tests pass with >80% coverage
5. Run the linter and fix all issues
6. Submit a Pull Request

### Commit Messages

Use conventional commit format:

```
type(scope): description

[optional body]
```

Types: `feat`, `fix`, `docs`, `style`, `refactor`, `test`, `chore`

---

## Debugging

### Development Mode

Run `npm run dev` to start a development server with hot reload.

### Browser DevTools

1. Open Discord in your browser
2. Open DevTools (F12)
3. The userscript will log to console with `[Detcord]` prefix

### Common Issues

**Token extraction fails:**
- Check if Discord's localStorage structure has changed
- Verify webpack chunk name (`webpackChunkdiscord_app`)

**Rate limiting:**
- Increase delay values in configuration
- Check for 429 response handling

**Messages not found:**
- Verify author ID matches current user
- Check if search index is stale (202 response)

---

## Release Process

1. Update version in `package.json`
2. Update `CHANGELOG.md`
3. Run full test suite
4. Build userscript: `npm run build:userscript`
5. Create GitHub release with `dist/detcord.user.js`

---

## Resources

- [Discord API Documentation](https://discord.com/developers/docs)
- [Tampermonkey Documentation](https://www.tampermonkey.net/documentation.php)
- [Vite Documentation](https://vitejs.dev/)
- [Vitest Documentation](https://vitest.dev/)
- [Biome Documentation](https://biomejs.dev/)
- [TypeScript Documentation](https://www.typescriptlang.org/docs/)
