/**
 * Styles for elements introduced by the running, completion and error screens.
 *
 * Base tokens and the shared components live in window-styles.ts; this string
 * is appended after it at injection time (see controller.ts). Use the
 * `--dc-*` custom properties defined on the container; never add literals.
 *
 * The `var()` fallbacks exist only so the run screens stay legible if a token
 * is missing; the tokens themselves are the source of truth.
 */

import { CSS_PREFIX } from './constants';

/** Timing and easing for the only non-hold transitions in the run screens. */
const MOVE = '200ms cubic-bezier(0.16, 1, 0.3, 1)';

/** Additional CSS for the running, completion and error screens. */
export const RUN_STYLES = `
/* ============================================
   RUN, RECEIPT AND HOLD-TO-CONFIRM
   ============================================ */

/* Hold-to-confirm: the fill is the only authored motion in the interface. */
.${CSS_PREFIX}-hold {
	position: relative;
	overflow: hidden;
	isolation: isolate;
	touch-action: none;
	user-select: none;
	-webkit-user-select: none;
}

.${CSS_PREFIX}-hold::before {
	content: '';
	position: absolute;
	inset: 0;
	transform-origin: left center;
	transform: scaleX(var(--hold-progress, 0));
	background: color-mix(in oklch, var(--detcord-ink, #ECEEF3) 28%, transparent);
	opacity: 0;
	pointer-events: none;
	z-index: -1;
}

.${CSS_PREFIX}-hold.holding::before {
	opacity: 1;
}

/* Running screen: one instrument. */
.${CSS_PREFIX}-run {
	display: flex;
	flex-direction: column;
	gap: 12px;
	padding: 16px 0 8px;
}

.${CSS_PREFIX}-run-count {
	font-size: 40px;
	line-height: 1;
	font-weight: 600;
	font-variant-numeric: tabular-nums;
	letter-spacing: -0.02em;
	color: var(--detcord-ink, #ECEEF3);
	transition: color ${MOVE};
}

.${CSS_PREFIX}-run-track {
	height: 3px;
	border-radius: 999px;
	overflow: hidden;
	background: color-mix(in oklch, var(--detcord-ink, #ECEEF3) 12%, transparent);
}

.${CSS_PREFIX}-run-bar {
	height: 100%;
	border-radius: 999px;
	background: var(--detcord-signal, #F2A93B);
	transition: width ${MOVE};
}

.${CSS_PREFIX}-run-figures {
	display: flex;
	gap: 24px;
}

.${CSS_PREFIX}-run-figure {
	display: flex;
	flex-direction: column;
	gap: 2px;
}

.${CSS_PREFIX}-run-figure-hidden {
	display: none;
}

.${CSS_PREFIX}-run-figure-value {
	font-size: 16px;
	font-weight: 600;
	font-variant-numeric: tabular-nums;
	color: var(--detcord-ink, #ECEEF3);
	transition: color ${MOVE};
}

.${CSS_PREFIX}-run-figure-label {
	font-size: 12px;
	color: var(--detcord-ink-2, #B8BCC6);
}

.${CSS_PREFIX}-run-times {
	display: flex;
	gap: 24px;
	font-size: 12px;
	font-variant-numeric: tabular-nums;
	color: var(--detcord-ink-2, #B8BCC6);
}

/* Log: a time column, an outcome word, then the message. */
.${CSS_PREFIX}-log-row {
	display: grid;
	grid-template-columns: auto auto minmax(0, 1fr);
	gap: 8px;
	align-items: baseline;
	padding: 2px 0;
	font-size: 14px;
	background: none;
	border: none;
}

.${CSS_PREFIX}-log-time {
	font-size: 12px;
	font-variant-numeric: tabular-nums;
	color: var(--detcord-ink-2, #B8BCC6);
}

.${CSS_PREFIX}-log-outcome {
	white-space: nowrap;
	color: var(--detcord-ink-2, #B8BCC6);
}

.${CSS_PREFIX}-feed-deleted .${CSS_PREFIX}-log-outcome {
	color: var(--detcord-deleted-ink, #3DBE7A);
}

.${CSS_PREFIX}-feed-failed .${CSS_PREFIX}-log-outcome {
	color: var(--detcord-failed-ink, #E5484D);
}

.${CSS_PREFIX}-feed-skipped .${CSS_PREFIX}-log-outcome,
.${CSS_PREFIX}-feed-already-gone .${CSS_PREFIX}-log-outcome {
	color: var(--detcord-ink-2, #B8BCC6);
}

.${CSS_PREFIX}-log-text {
	overflow: hidden;
	white-space: nowrap;
	text-overflow: ellipsis;
	color: var(--detcord-ink, #ECEEF3);
}

/* Completion: a receipt, not a celebration. */
.${CSS_PREFIX}-receipt {
	display: grid;
	grid-template-columns: minmax(0, 1fr) auto;
	gap: 4px 24px;
	margin: 16px 0;
}

.${CSS_PREFIX}-receipt-row {
	display: grid;
	grid-column: 1 / -1;
	grid-template-columns: subgrid;
	padding: 4px 0;
	font-size: 14px;
}

.${CSS_PREFIX}-receipt-label {
	color: var(--detcord-ink-2, #B8BCC6);
}

.${CSS_PREFIX}-receipt-value {
	text-align: right;
	font-variant-numeric: tabular-nums;
	color: var(--detcord-ink, #ECEEF3);
}

.${CSS_PREFIX}-receipt-note {
	font-size: 12px;
	color: var(--detcord-ink-2, #B8BCC6);
}

.${CSS_PREFIX}-field-hint {
	margin: 8px 0 0;
	font-size: 12px;
	color: var(--detcord-ink-2, #B8BCC6);
}

/* Minimised: a pill carrying the count, not a ring. */
.${CSS_PREFIX}-mini-count {
	font-size: 14px;
	font-weight: 600;
	font-variant-numeric: tabular-nums;
	padding: 6px 12px;
	border-radius: 999px;
	background: var(--detcord-signal, #F2A93B);
	color: var(--detcord-ground, #17181D);
}

@media (prefers-reduced-motion: reduce) {
	.${CSS_PREFIX}-run-bar,
	.${CSS_PREFIX}-run-count,
	.${CSS_PREFIX}-run-figure-value {
		transition: none;
	}

	.${CSS_PREFIX}-hold::before {
		display: none;
	}
}
`;
