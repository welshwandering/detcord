# Design system

## Direction

Detcord is a controlled-demolition tool. Its interface is the panel of a
precision instrument: calm, compact, legible at a glance, and free of
decoration the job does not need.

Detcord must not look like a Discord feature or use Discord blurple. It is an
independent tool running inside Discord.

Use one 440px sheet. Present one decision per step. Keep changing numbers
tabular. Use warm-tinted neutrals and reserve one warm signal colour for the
irreversible act.

## Colour

Base tokens are scoped to the Detcord container. Their canonical values are
defined in OKLCH; the hex values state the approved appearance target.
`light-dark()` follows Discord's active light or dark theme. Use
`color-mix(in oklch, ...)` to derive borders, hover states, pressed states,
tracks, and muted fills from these tokens rather than adding colour literals.

### Dark theme

| Token | OKLCH | Hex | Required use and contrast |
| --- | --- | --- | --- |
| Ground | `oklch(0.2102 0.0100 276.6)` | `#17181D` | Page-facing ground. |
| Surface | `oklch(0.2613 0.0134 272.8)` | `#22242B` | Sheet and raised controls. |
| Ink | `oklch(0.9490 0.0070 268.5)` | `#ECEEF3` | Primary text; 13.35:1 on surface and 15.27:1 on ground. |
| Secondary ink | `oklch(0.7951 0.0148 268.5)` | `#B8BCC6` | Secondary text; 8.15:1 on surface and 9.32:1 on ground. |
| Signal | `oklch(0.7871 0.1471 73.0)` | `#F2A93B` | Irreversible action only; 7.76:1 on surface. Use ground-coloured button text at 8.87:1. |

### Light theme

| Token | OKLCH | Hex | Required use and contrast |
| --- | --- | --- | --- |
| Ground | `oklch(0.9731 0.0041 91.4)` | `#F7F6F3` | Page-facing ground. |
| Surface | `oklch(1.0000 0.0000 0)` | `#FFFFFF` | Sheet and raised controls. |
| Ink | `oklch(0.2091 0.0104 268.2)` | `#16181D` | Primary text; 17.76:1 on surface and 16.43:1 on ground. |
| Secondary ink | `oklch(0.5030 0.0235 267.1)` | `#5E6472` | Secondary text; 5.93:1 on surface and 5.49:1 on ground. |
| Signal | `oklch(0.6500 0.1433 65.6)` | `#C97A08` | Irreversible action only. Do not use as small text; use ink on signal at 5.30:1. |

### Semantic colour

| Token | OKLCH | Hex | Use |
| --- | --- | --- | --- |
| Deleted | `oklch(0.7146 0.1502 155.9)` | `#3DBE7A` | Successful deletion indicator. |
| Failed | `oklch(0.6256 0.1933 23.0)` | `#E5484D` | Failed deletion indicator. |

All text must reach at least 4.5:1 against its background in both themes.
Signal, Deleted, and Failed are not automatic text colours. Pair semantic
colour with an ink-coloured label, icon, or count, and never make colour the
only carrier of meaning.

## Type

Use Discord's existing `gg sans` stack. Do not load web fonts. Identity comes
from scale, weight, spacing, and alignment rather than a display face.

| Size | Role |
| --- | --- |
| 12px | Timestamps, metadata, and compact labels |
| 14px | Body copy, controls, rows, and logs |
| 16px | Emphasised labels and section values |
| 18px | Step and outcome titles |
| 40px | Standalone receipt and progress counts |

Use tabular numerals everywhere a number can change: counts, dates, times,
durations, estimates, percentages, and progress.

## Space and shape

Use the spacing scale `4 / 8 / 12 / 16 / 24 / 32px`. Use 6px radii for
controls and rows, and 10px for the sheet and major grouped surfaces.

Avoid nested containers. Alignment and spacing should establish hierarchy
before borders or backgrounds are added.

## Layout

- The interface is one 440px sheet.
- Each step asks for one decision.
- The step titles are `Target`, `Range`, `Filters`, and `Review`.
- Targets and time ranges are rows, not cards.
- A persistent summary line sits under the header and fills in as choices are
  made.
- The Review screen is a receipt. Its count stands alone, followed by aligned
  rows for newest, oldest, skipped, and estimate.
- The commit button names the action and count, for example
  `Delete 12 messages`.
- The running screen is one instrument: a large `7 of 12` counter, a thin
  progress bar, three small figures, and a plain log with a time column.
- Completion repeats the receipt with the outcome in the title, such as
  `12 deleted`, `Stopped after 7`, or `3 could not be deleted`.
- Completion has no confetti.

Container queries adapt the internal arrangement when the host page leaves
less than 440px of usable width.

## Components

| Component | Rule |
| --- | --- |
| Window | A 440px sheet; the target is a native `<dialog>` with `inert` on the page behind it (1.1.0 ships a positioned element with the same behaviour). |
| Trigger | A compact Detcord-labelled control that does not imitate Discord controls. |
| Choice row | One target or range per row, with the label and current state aligned. |
| Receipt row | A label and tabular value on a shared grid. Do not turn each row into a card. |
| Primary button | The strongest non-destructive action, using neutral tokens. |
| Secondary button | Lower-emphasis navigation, pause, stop, or cancellation. |
| Destructive button | The only control using Signal; its label names the action and count. |
| Inputs | Plain, labelled fields with visible validation and recovery text. |
| Toggles | Include an explicit text label and state; colour alone is insufficient. |
| Log row | A time column and factual event text. Keep rows plain and bounded. |
| Progress bar | Thin, determinate when a total is known, and paired with the numeric counter. |
| Hold-to-confirm | Press and hold the destructive button for 1.5 seconds while its fill advances. Release, Escape, or Close cancels. |

Use `popover` for temporary supporting information that does not require a
modal decision. Use `@starting-style` only for brief entry transitions.

## Confirmation

Hold-to-confirm replaces the `3-2-1-BOOM` countdown. The fill is the only
authored motion moment. It communicates elapsed hold time without changing
the button label or hiding the action.

Under `prefers-reduced-motion: reduce`, replace the hold with a plain two-step
confirmation. Escape and Close cancel either form immediately.

## Motion

- The hold fill lasts 1.5 seconds.
- Every other transition uses exponential ease-out and lasts no more than
  240ms.
- View Transitions may connect wizard steps without introducing decorative
  movement.
- Gate every transition and animation with `prefers-reduced-motion`.
- Do not animate changing log rows, counters, or semantic outcomes for effect.

## Copy

- Step titles are statements: `Target`, `Range`, `Filters`, and `Review`.
- Controls name their action: `Continue`, `Back`, `Stop`, or
  `Delete 12 messages`.
- Status lines state what the engine is doing, for example
  `Waiting 4 s for Discord's rate limit`.
- Errors name the problem and the recovery.
- Completion titles state the outcome.
- Do not use jokes, euphemisms, celebration, or mock drama around deletion.

## Accessibility

- Provide a visible focus ring with at least 3:1 contrast against adjacent
  colours.
- Keep pointer targets at least 44 by 44px.
- Put progress, waits, stops, errors, and completion in an appropriate live
  region without announcing every decorative update.
- Keep focus inside the open dialog and restore it to the trigger on close.
- Support keyboard operation for every control, including cancellation.
- Test contrast, focus, status meaning, and interaction in both themes.
- Honour reduced motion for the hold, step changes, entry, and progress.
- Pair every semantic colour with text or another non-colour indicator.

## Refuse by default

Do not add these without a documented, task-specific reason:

- same-size cards for every choice;
- nested cards;
- gradient text;
- glass as decoration;
- monospace as costume;
- emoji as icons;
- glows;
- purple gradients.

## Practice

The repository uses [pbakaus/impeccable](https://github.com/pbakaus/impeccable)
under Apache 2.0 as its design practice. [PRODUCT.md](PRODUCT.md) and this file
are its durable inputs. Run `critique`, `audit`, and `polish` before UI changes
ship.

## Changing the design

Start with the tokens at the top of `src/ui/window-styles.ts`. Keep them scoped
to the Detcord container and derive variants with `color-mix()`. Do not add
colour literals outside that token block.

Change structure in `src/ui/window-markup.ts`. Preserve the single-sheet
layout, summary line, receipt grids, running instrument, and accessible dialog
semantics.
