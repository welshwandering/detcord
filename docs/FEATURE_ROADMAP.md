# Feature Roadmap

What needs to be built to make Detcord the definitive Discord message deletion tool.

---

## Current State

The TypeScript core and UI layer are complete:

### Core Modules (`src/core/`)
- `DeletionEngine` — Orchestration with state machine
- `DiscordApiClient` — API calls with rate limit handling
- `token.ts` — Token extraction (localStorage + webpack)
- `persistence.ts` — Session save/resume
- `types.ts` — Shared type definitions

### Utility Modules (`src/utils/`)
- `helpers.ts` — Snowflake conversion, formatting, escaping
- `performance.ts` — Throttling, batching, cleanup
- `validators.ts` — Regex validation (ReDoS prevention), snowflake/token validation

### UI Layer (`src/ui/`)
- `controller.ts` — Main `DetcordUI` class with wizard-based interface
- `templates.ts` — HTML templates and DOM utilities
- `effects.ts` — Visual effects (confetti, countdown, shake, flash)
- `styles.ts` — Discord-themed CSS with animations

### Entry Point
- `index.ts` — Auto-initialization for userscript environment

---

## Phase 1: UI Implementation ✅ Complete

All screens and core functionality are implemented in TypeScript.

### Screens

| Screen | Status | Notes |
|--------|--------|-------|
| Toolbar button | ✅ Done | Bomb icon with click handler |
| Main window | ✅ Done | Draggable, minimizable, closable |
| Target selection | ✅ Done | Channel/Server/DM card selection |
| Filter form | ✅ Done | Dates, content, checkboxes, advanced options |
| Preview | ✅ Done | Count + sample messages + time estimate |
| Countdown | ✅ Done | 3-2-1-BOOM animation with abort |
| Progress | ✅ Done | Ring, live feed, pause/stop, stats |
| Completion | ✅ Done | Stats + confetti celebration |

### Interactions

| Interaction | Status | Notes |
|-------------|--------|-------|
| Drag to move | ✅ Done | Header as draggable handle |
| Minimize to background | ✅ Done | Window minimize button |
| Keyboard shortcuts | ⏳ Partial | Escape to close implemented |
| Touch support | ❌ Not started | Mobile-friendly dragging |

### Animations

| Animation | Status | Notes |
|-----------|--------|-------|
| Window open | ✅ Done | Scale + fade in animation |
| Screen transitions | ✅ Done | Slide/fade between wizard steps |
| Countdown pulse | ✅ Done | Number scale + shake effect |
| Progress ring | ✅ Done | SVG stroke-dashoffset animation |
| Message shatter | ❌ Not started | Deleted message particle effect |
| Confetti | ✅ Done | Discord-themed celebration |
| Button ripple | ⏳ Partial | Hover/active states, no ripple |

---

## Phase 2: Features from Competitors

### From Undiscord

| Feature | Priority | Effort | Value |
|---------|----------|--------|-------|
| **Visual Message Picker** | High | Medium | High |
| Overlay on Discord that lets you click messages to set min/max ID boundaries. Much easier than finding dates manually. |
| **Archive Import** | Medium | Medium | Medium |
| Parse Discord data export (`index.json`) to auto-populate channel list for batch operations. |
| **Streamer Mode** | Low | Low | Low |
| Redact tokens, IDs, and message content in UI. Already have `escapeHtml`, just need toggle. |

### From Deleo

| Feature | Priority | Effort | Value |
|---------|----------|--------|-------|
| **CLI Mode** | Low | High | Low |
| Separate CLI tool using same core. Nice for scripting but not core use case. |

### From MesDel

Nothing unique to adopt. Their features are a subset of what we already have.

---

## Phase 3: Differentiation Features

Features no competitor has that would make Detcord clearly best-in-class.

### Must Have

| Feature | Description | Why |
|---------|-------------|-----|
| **Dry Run Mode** | Toggle to preview what would be deleted without actually deleting. Shows full message list, applies filters, but DELETE calls are skipped. | Safety. Users can verify before committing. |
| **Message Export** | Before deletion, export messages to JSON/TXT. Optionally include attachment URLs. | Backup. The #1 fear is "what if I delete something I needed?" |

### Should Have

| Feature | Description | Why |
|---------|-------------|-----|
| **Filter Presets** | Save named filter configurations (e.g., "All images before 2023"). Load with one click. | Power users with recurring needs. |
| **Deletion History** | Log of past deletion sessions with stats. Persisted to localStorage. | Visibility into past actions. |
| **Large Batch Confirmation** | For deletions > 1000 messages, require typing "DELETE" to proceed. | Prevents accidents on massive operations. |

### Nice to Have

| Feature | Description | Why |
|---------|-------------|-----|
| **Scheduled Deletion** | Set a start time in the future. | "Delete everything tonight while I sleep." |
| **Desktop Notifications** | Browser notification when complete. | Long operations benefit from alerts. |
| **Sound Effects** | Optional audio feedback. | Some users appreciate it. |
| **Visual Timeline** | Histogram of messages over time. | Helps understand scope. |

---

## Phase 4: Accessibility

| Requirement | Status | Notes |
|-------------|--------|-------|
| Keyboard navigation | ⏳ Partial | Tab order implemented, Enter/Space activation |
| Focus indicators | ✅ Done | `:focus-visible` styling with visible rings |
| ARIA labels | ✅ Done | All interactive elements labeled |
| Live regions | ✅ Done | `aria-live="polite"` for progress feed |
| Reduced motion | ✅ Done | `prefers-reduced-motion` media query support |
| Color contrast | ⏳ Partial | Uses Discord's theme variables |
| Screen reader testing | ❌ Not started | Manual verification needed |

---

## Success Criteria

Detcord becomes the #1 choice when:

1. **It just works** — Token detection, rate limiting, error recovery all seamless
2. **It's safe** — Dry run + export means users never fear data loss
3. **It's accessible** — Works for everyone, not just power users
4. **It's polished** — The UX feels as good as a first-party feature
5. **It's maintained** — TypeScript + tests mean bugs get fixed fast

---

## Non-Goals

Things we're explicitly not building:

- **Bot functionality** — This is for human users in browsers
- **Bulk DM sending** — Deletion only, not spam tools
- **Other users' messages** — API doesn't allow, we don't try
- **Desktop app** — Browser userscript only
- **Message editing** — Out of scope

---

*Updated: January 2026*
