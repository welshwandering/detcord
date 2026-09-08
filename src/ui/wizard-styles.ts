/**
 * Styles for elements introduced by the wizard screens.
 *
 * Base tokens and the shared components live in window-styles.ts; this string
 * is appended after it at injection time (see controller.ts). Use the
 * `--dc-*` custom properties defined on the container; never add literals.
 *
 * Only two things belong here: elements this module added (the persistent
 * summary line, the toggle group label) and the structural facts the wizard
 * markup depends on (choice rows are one per line, label left and hint
 * right). Colour, selection marking and type scale stay in window-styles.ts,
 * which owns every class name shared with the rest of the window.
 */

import { CSS_PREFIX } from './constants';

/** Secondary text colour, falling back to a muted currentColor. */
const SECONDARY_INK =
  'var(--detcord-ink-2, var(--detcord-ink-2, color-mix(in oklch, currentColor 75%, transparent)))';

/** Additional CSS for the wizard and review screens. */
export const WIZARD_STYLES = `
/* Persistent summary line, under the step indicator. */
.${CSS_PREFIX}-wizard-summary {
	padding: 0 20px 12px;
	font-size: 12px;
	line-height: 1.4;
	color: ${SECONDARY_INK};
	font-variant-numeric: tabular-nums;
}

.${CSS_PREFIX}-wizard-summary:empty {
	display: none;
}

/* Group heading above a set of related toggles. */
.${CSS_PREFIX}-toggle-group-label {
	font-size: 12px;
	color: ${SECONDARY_INK};
	margin-bottom: 4px;
}

/* Choice rows: one per line, label left, hint right. */
.${CSS_PREFIX}-cards {
	display: flex;
	flex-direction: column;
	gap: 4px;
}

.${CSS_PREFIX}-card,
.${CSS_PREFIX}-option {
	display: flex;
	align-items: center;
	justify-content: space-between;
	gap: 12px;
	width: 100%;
	min-height: 44px;
	text-align: left;
	font: inherit;
	color: inherit;
}

/* The controller shows and hides these two rows with an inline display, which
   would otherwise defeat the row layout. See the report: this bridge goes
   when controller.ts toggles a class instead. */
.${CSS_PREFIX}-card-desc,
.${CSS_PREFIX}-option-hint {
	color: ${SECONDARY_INK};
	font-size: 12px;
	white-space: nowrap;
	font-variant-numeric: tabular-nums;
}

/* Toggles are buttons with role="switch": reset the UA button box. */
.${CSS_PREFIX}-toggle-switch {
	appearance: none;
	border: 0;
	padding: 0;
	font: inherit;
}

/* Target rows the current page cannot offer (DM, server) are hidden. */
.${CSS_PREFIX}-card[hidden] {
	display: none;
}
`;
