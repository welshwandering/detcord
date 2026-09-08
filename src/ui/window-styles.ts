/**
 * Detcord window styles
 *
 * The complete CSS for the floating wizard window. Extracted from the
 * controller so that the controller module stays readable.
 *
 * Every colour, size and easing comes from a design token declared on the
 * mounted root. Tokens are never declared on `:root` - that belongs to
 * Discord. Base values are written as hex first and upgraded to OKLCH (with
 * `color-mix` derivations) only where the browser supports them, so the
 * interface resolves identically without modern colour functions.
 */

import { CSS_PREFIX, WINDOW_Z_INDEX } from './constants';

/** The mounted root, which owns every design token. */
const ROOT = `#${CSS_PREFIX}-container, .${CSS_PREFIX}-container`;

/** The root when Discord marks its own document as light. */
const LIGHT_ROOT = `html.theme-light #${CSS_PREFIX}-container,
html.theme-light .${CSS_PREFIX}-container`;

/** The root when Discord states no theme and the operating system asks for light. */
const AUTO_LIGHT_ROOT = `html:not(.theme-light):not(.theme-dark) #${CSS_PREFIX}-container,
html:not(.theme-light):not(.theme-dark) .${CSS_PREFIX}-container`;

/**
 * Dark palette, and the scales shared by both themes.
 *
 * `lift` is the pole every semantic text colour is mixed towards to reach
 * 4.5:1; it is white on dark and black on light, so one set of derivations
 * serves both themes without shifting hue.
 */
const DARK_TOKENS = `
	color-scheme: dark;

	--${CSS_PREFIX}-ground: #17181D;
	--${CSS_PREFIX}-surface: #22242B;
	--${CSS_PREFIX}-ink: #ECEEF3;
	--${CSS_PREFIX}-ink-2: #B8BCC6;
	--${CSS_PREFIX}-line: #363940;
	--${CSS_PREFIX}-signal: #F2A93B;

	--${CSS_PREFIX}-lift: #FFFFFF;
	--${CSS_PREFIX}-on-signal: #17181D;

	--${CSS_PREFIX}-deleted: #3DBE7A;
	--${CSS_PREFIX}-failed: #E5484D;

	--${CSS_PREFIX}-hover: #292B32;
	--${CSS_PREFIX}-signal-hover: #F4B45B;
	--${CSS_PREFIX}-signal-edge: #B47C29;
	--${CSS_PREFIX}-signal-ink: #F5B764;
	--${CSS_PREFIX}-deleted-ink: #4EC282;
	--${CSS_PREFIX}-failed-ink: #EA5E5F;
`;

/** Light palette. Same token names, so no rule below needs a theme branch. */
const LIGHT_TOKENS = `
	color-scheme: light;

	--${CSS_PREFIX}-ground: #F7F6F3;
	--${CSS_PREFIX}-surface: #FFFFFF;
	--${CSS_PREFIX}-ink: #16181D;
	--${CSS_PREFIX}-ink-2: #5E6472;
	--${CSS_PREFIX}-line: #DADADB;
	--${CSS_PREFIX}-signal: #C97A08;

	--${CSS_PREFIX}-lift: #000000;
	--${CSS_PREFIX}-on-signal: #16181D;

	--${CSS_PREFIX}-deleted: #1F8A52;
	--${CSS_PREFIX}-failed: #C93338;

	--${CSS_PREFIX}-hover: #F4F4F5;
	--${CSS_PREFIX}-signal-hover: #D18A3C;
	--${CSS_PREFIX}-signal-edge: #955904;
	--${CSS_PREFIX}-signal-ink: #9F5F05;
	--${CSS_PREFIX}-deleted-ink: #1C7F4B;
	--${CSS_PREFIX}-failed-ink: #AE2B2F;
`;

/** Dark base values in OKLCH, applied only where the browser can resolve them. */
const DARK_BASE_OKLCH = `
	--${CSS_PREFIX}-ground: oklch(21% 0.010 276.6);
	--${CSS_PREFIX}-surface: oklch(26.1% 0.013 272.8);
	--${CSS_PREFIX}-ink: oklch(94.9% 0.007 268.5);
	--${CSS_PREFIX}-ink-2: oklch(79.5% 0.015 268.5);
	--${CSS_PREFIX}-signal: oklch(78.7% 0.147 73);
	--${CSS_PREFIX}-deleted: oklch(71.5% 0.150 155.9);
	--${CSS_PREFIX}-failed: oklch(62.6% 0.193 23);
	--${CSS_PREFIX}-line: color-mix(in oklch, var(--${CSS_PREFIX}-ink) 12%, var(--${CSS_PREFIX}-surface));
`;

/** Light base values in OKLCH. */
const LIGHT_BASE_OKLCH = `
	--${CSS_PREFIX}-ground: oklch(97.3% 0.004 91.4);
	--${CSS_PREFIX}-surface: oklch(100% 0 0);
	--${CSS_PREFIX}-ink: oklch(20.9% 0.010 268.2);
	--${CSS_PREFIX}-ink-2: oklch(50.3% 0.023 267.1);
	--${CSS_PREFIX}-signal: oklch(65% 0.143 65.6);
	--${CSS_PREFIX}-deleted: oklch(56.1% 0.128 154.9);
	--${CSS_PREFIX}-failed: oklch(55.5% 0.186 24.1);
	--${CSS_PREFIX}-line: color-mix(in oklch, var(--${CSS_PREFIX}-ink) 14%, var(--${CSS_PREFIX}-surface));
`;

/**
 * Everything that is not a base value, derived once for both themes.
 *
 * Semantic and signal text colours are mixed towards `lift` until they clear
 * 4.5:1 on both `ground` and `surface`; white and black carry no hue, so the
 * mix changes lightness without dragging the hue towards a neutral.
 */
const DERIVED_TOKENS = `
	--${CSS_PREFIX}-hover: color-mix(in oklch, var(--${CSS_PREFIX}-ink) 4%, var(--${CSS_PREFIX}-surface));
	--${CSS_PREFIX}-signal-hover: color-mix(in oklch, var(--${CSS_PREFIX}-signal) 88%, #fff);
	--${CSS_PREFIX}-signal-edge: color-mix(in oklch, var(--${CSS_PREFIX}-signal) 80%, #000);
	--${CSS_PREFIX}-signal-ink: color-mix(in oklch, var(--${CSS_PREFIX}-signal) 84%, var(--${CSS_PREFIX}-lift));
	--${CSS_PREFIX}-deleted-ink: color-mix(in oklch, var(--${CSS_PREFIX}-deleted) 94%, var(--${CSS_PREFIX}-lift));
	--${CSS_PREFIX}-failed-ink: color-mix(in oklch, var(--${CSS_PREFIX}-failed) 90%, var(--${CSS_PREFIX}-lift));
`;

/** Radii, spacing, type and motion. Identical in both themes. */
const SCALE_TOKENS = `
	--${CSS_PREFIX}-radius: 6px;
	--${CSS_PREFIX}-radius-window: 10px;

	--${CSS_PREFIX}-space-1: 4px;
	--${CSS_PREFIX}-space-2: 8px;
	--${CSS_PREFIX}-space-3: 12px;
	--${CSS_PREFIX}-space-4: 16px;
	--${CSS_PREFIX}-space-5: 24px;
	--${CSS_PREFIX}-space-6: 32px;
	--${CSS_PREFIX}-pad: var(--${CSS_PREFIX}-space-5);

	--${CSS_PREFIX}-text-1: 12px;
	--${CSS_PREFIX}-text-2: 14px;
	--${CSS_PREFIX}-text-3: 16px;
	--${CSS_PREFIX}-text-4: 18px;
	--${CSS_PREFIX}-text-hero: 40px;

	--${CSS_PREFIX}-face: 'gg sans', 'Noto Sans', system-ui, sans-serif;
	--${CSS_PREFIX}-ease: cubic-bezier(0.16, 1, 0.3, 1);
	--${CSS_PREFIX}-motion: 160ms;
	--${CSS_PREFIX}-motion-slow: 240ms;
	--${CSS_PREFIX}-shadow: 0 12px 32px rgb(0 0 0 / 0.35);
`;

/** Full stylesheet for the Detcord window, trigger button and overlays. */
export const WINDOW_STYLES = `
/* ============================================
   DETCORD - precision instrument panel
   Tokens are scoped to the mounted root, never :root.
   ============================================ */

${ROOT} {
${DARK_TOKENS}${SCALE_TOKENS}}

${LIGHT_ROOT} {
${LIGHT_TOKENS}}

@media (prefers-color-scheme: light) {
${AUTO_LIGHT_ROOT} {
${LIGHT_TOKENS}}
}

@supports (color: color-mix(in oklch, red 1%, blue)) {
${ROOT} {
${DARK_BASE_OKLCH}${DERIVED_TOKENS}}

${LIGHT_ROOT} {
${LIGHT_BASE_OKLCH}${DERIVED_TOKENS}}

	@media (prefers-color-scheme: light) {
${AUTO_LIGHT_ROOT} {
${LIGHT_BASE_OKLCH}${DERIVED_TOKENS}}
	}
}

/* ============================================
   Base
   ============================================ */

${ROOT} {
	font-family: var(--${CSS_PREFIX}-face);
}

.${CSS_PREFIX}-window *,
.${CSS_PREFIX}-window *::before,
.${CSS_PREFIX}-window *::after {
	box-sizing: border-box;
}

.${CSS_PREFIX}-window :focus-visible,
.${CSS_PREFIX}-trigger:focus-visible,
.${CSS_PREFIX}-mini-indicator:focus-visible {
	outline: 2px solid var(--${CSS_PREFIX}-signal);
	outline-offset: 2px;
}

/* Numbers read as columns, never as prose. */
.${CSS_PREFIX}-summary-count,
.${CSS_PREFIX}-summary-details,
.${CSS_PREFIX}-review-summary dd,
.${CSS_PREFIX}-progress-percent,
.${CSS_PREFIX}-progress-count,
.${CSS_PREFIX}-stat-value,
.${CSS_PREFIX}-time-value,
.${CSS_PREFIX}-selected-count,
.${CSS_PREFIX}-channel-progress,
.${CSS_PREFIX}-complete-stats,
.${CSS_PREFIX}-option-hint,
.${CSS_PREFIX}-waiting {
	font-variant-numeric: tabular-nums;
}

/* ============================================
   Trigger and minimised indicator
   ============================================ */

.${CSS_PREFIX}-trigger {
	position: fixed;
	bottom: var(--${CSS_PREFIX}-space-5);
	right: var(--${CSS_PREFIX}-space-5);
	width: 44px;
	height: 44px;
	padding: 0;
	border-radius: 50%;
	background: var(--${CSS_PREFIX}-signal);
	border: 1px solid var(--${CSS_PREFIX}-signal-edge);
	cursor: pointer;
	display: flex;
	align-items: center;
	justify-content: center;
	transition: background var(--${CSS_PREFIX}-motion) var(--${CSS_PREFIX}-ease),
		transform var(--${CSS_PREFIX}-motion) var(--${CSS_PREFIX}-ease);
	z-index: ${WINDOW_Z_INDEX};
}

.${CSS_PREFIX}-trigger:hover {
	background: var(--${CSS_PREFIX}-signal-hover);
	transform: translateY(-1px);
}

.${CSS_PREFIX}-trigger svg {
	width: 20px;
	height: 20px;
	fill: var(--${CSS_PREFIX}-on-signal);
}

.${CSS_PREFIX}-mini-indicator {
	position: fixed;
	bottom: 76px;
	right: var(--${CSS_PREFIX}-space-5);
	width: 56px;
	height: 56px;
	border-radius: 50%;
	background: var(--${CSS_PREFIX}-surface);
	border: 1px solid var(--${CSS_PREFIX}-line);
	display: none;
	align-items: center;
	justify-content: center;
	cursor: pointer;
	z-index: ${WINDOW_Z_INDEX + 2};
	box-shadow: var(--${CSS_PREFIX}-shadow);
	transition: transform var(--${CSS_PREFIX}-motion) var(--${CSS_PREFIX}-ease);
}

.${CSS_PREFIX}-mini-indicator.visible {
	display: flex;
}

.${CSS_PREFIX}-mini-indicator:hover {
	transform: translateY(-1px);
}

/* ============================================
   Backdrop and window
   ============================================ */

.${CSS_PREFIX}-backdrop {
	position: fixed;
	inset: 0;
	background: rgb(0 0 0 / 0.72);
	background: light-dark(rgb(0 0 0 / 0.32), rgb(0 0 0 / 0.72));
	z-index: ${WINDOW_Z_INDEX};
	display: none;
}

.${CSS_PREFIX}-backdrop.visible {
	display: block;
}

.${CSS_PREFIX}-window {
	position: fixed;
	top: 50%;
	left: 50%;
	transform: translate(-50%, -50%);
	width: 440px;
	max-width: 95vw;
	max-height: 85vh;
	background: var(--${CSS_PREFIX}-ground);
	border: 1px solid var(--${CSS_PREFIX}-line);
	border-radius: var(--${CSS_PREFIX}-radius-window);
	box-shadow: var(--${CSS_PREFIX}-shadow);
	z-index: ${WINDOW_Z_INDEX + 1};
	display: none;
	flex-direction: column;
	overflow: visible;
	container-type: inline-size;
	container-name: ${CSS_PREFIX}-window;
	font-family: var(--${CSS_PREFIX}-face);
	font-size: var(--${CSS_PREFIX}-text-2);
	line-height: 1.45;
	color: var(--${CSS_PREFIX}-ink);
	opacity: 0;
	transition: opacity var(--${CSS_PREFIX}-motion-slow) var(--${CSS_PREFIX}-ease),
		translate var(--${CSS_PREFIX}-motion-slow) var(--${CSS_PREFIX}-ease);
}

.${CSS_PREFIX}-window.visible {
	display: flex;
	opacity: 1;
	translate: none;
}

@starting-style {
	.${CSS_PREFIX}-window.visible {
		opacity: 0;
		translate: 0 8px;
	}
}

/* Header doubles as the drag handle. */
.${CSS_PREFIX}-header {
	display: flex;
	align-items: center;
	justify-content: space-between;
	padding: var(--${CSS_PREFIX}-space-4) var(--${CSS_PREFIX}-pad);
	background: var(--${CSS_PREFIX}-surface);
	border-bottom: 1px solid var(--${CSS_PREFIX}-line);
	border-radius: calc(var(--${CSS_PREFIX}-radius-window) - 1px) calc(var(--${CSS_PREFIX}-radius-window) - 1px) 0 0;
	cursor: grab;
	user-select: none;
}

.${CSS_PREFIX}-header:active {
	cursor: grabbing;
}

.${CSS_PREFIX}-header h2 {
	margin: 0;
	font-size: var(--${CSS_PREFIX}-text-3);
	font-weight: 600;
	letter-spacing: 0.01em;
	color: var(--${CSS_PREFIX}-ink);
}

.${CSS_PREFIX}-header-buttons {
	display: flex;
	align-items: center;
	gap: var(--${CSS_PREFIX}-space-1);
	cursor: default;
}

.${CSS_PREFIX}-close,
.${CSS_PREFIX}-minimize {
	width: 28px;
	height: 28px;
	border: none;
	background: transparent;
	cursor: pointer;
	padding: 0;
	display: flex;
	align-items: center;
	justify-content: center;
	border-radius: var(--${CSS_PREFIX}-radius);
	transition: background var(--${CSS_PREFIX}-motion) var(--${CSS_PREFIX}-ease);
}

.${CSS_PREFIX}-close:hover,
.${CSS_PREFIX}-minimize:hover {
	background: var(--${CSS_PREFIX}-hover);
}

.${CSS_PREFIX}-close svg,
.${CSS_PREFIX}-minimize svg {
	width: 16px;
	height: 16px;
	fill: var(--${CSS_PREFIX}-ink-2);
	transition: fill var(--${CSS_PREFIX}-motion) var(--${CSS_PREFIX}-ease);
}

.${CSS_PREFIX}-close:hover svg,
.${CSS_PREFIX}-minimize:hover svg {
	fill: var(--${CSS_PREFIX}-ink);
}

/* ============================================
   Step indicator, content, screens
   ============================================ */

.${CSS_PREFIX}-steps {
	display: flex;
	gap: var(--${CSS_PREFIX}-space-2);
	padding: var(--${CSS_PREFIX}-space-4) var(--${CSS_PREFIX}-pad) 0;
}

.${CSS_PREFIX}-step-dot {
	width: 24px;
	height: 2px;
	border-radius: 0;
	background: var(--${CSS_PREFIX}-line);
	transition: background var(--${CSS_PREFIX}-motion) var(--${CSS_PREFIX}-ease);
}

.${CSS_PREFIX}-step-dot.active {
	background: var(--${CSS_PREFIX}-signal);
}

.${CSS_PREFIX}-step-dot.completed {
	background: var(--${CSS_PREFIX}-ink-2);
}

.${CSS_PREFIX}-content {
	flex: 1;
	overflow-y: auto;
	overflow-x: hidden;
	padding: var(--${CSS_PREFIX}-pad);
	max-height: calc(85vh - 132px);
	scrollbar-width: thin;
	scrollbar-color: var(--${CSS_PREFIX}-line) transparent;
}

.${CSS_PREFIX}-screen {
	display: none;
}

.${CSS_PREFIX}-screen.active {
	display: block;
}

.${CSS_PREFIX}-wizard-step {
	display: none;
}

.${CSS_PREFIX}-wizard-step.active {
	display: block;
}

.${CSS_PREFIX}-step-title {
	font-size: var(--${CSS_PREFIX}-text-4);
	font-weight: 600;
	color: var(--${CSS_PREFIX}-ink);
	margin: 0 0 var(--${CSS_PREFIX}-space-4);
}

/* Hide the step indicator once the wizard is behind us. */
.${CSS_PREFIX}-window:has([data-screen="running"].active) .${CSS_PREFIX}-steps,
.${CSS_PREFIX}-window:has([data-screen="complete"].active) .${CSS_PREFIX}-steps,
.${CSS_PREFIX}-window:has([data-screen="error"].active) .${CSS_PREFIX}-steps {
	display: none;
}

/* ============================================
   Rows: targets, time ranges, channels
   ============================================ */

.${CSS_PREFIX}-cards,
.${CSS_PREFIX}-options {
	display: flex;
	flex-direction: column;
	margin: 0 0 var(--${CSS_PREFIX}-space-4);
}

.${CSS_PREFIX}-card,
.${CSS_PREFIX}-option {
	display: flex;
	align-items: center;
	gap: var(--${CSS_PREFIX}-space-3);
	min-height: 44px;
	padding: var(--${CSS_PREFIX}-space-2) var(--${CSS_PREFIX}-space-3);
	background: transparent;
	border: none;
	border-bottom: 1px solid var(--${CSS_PREFIX}-line);
	border-left: 2px solid transparent;
	border-radius: 0;
	cursor: pointer;
	text-align: left;
	transition: background var(--${CSS_PREFIX}-motion) var(--${CSS_PREFIX}-ease),
		border-color var(--${CSS_PREFIX}-motion) var(--${CSS_PREFIX}-ease);
}

.${CSS_PREFIX}-card:last-child,
.${CSS_PREFIX}-option:last-child {
	border-bottom: none;
}

.${CSS_PREFIX}-card:hover,
.${CSS_PREFIX}-option:hover {
	background: var(--${CSS_PREFIX}-hover);
}

.${CSS_PREFIX}-card.selected,
.${CSS_PREFIX}-option.selected {
	background: transparent;
	border-left-color: var(--${CSS_PREFIX}-signal);
}

/* The glyph is decoration the panel does not need. */
.${CSS_PREFIX}-card-icon {
	display: none;
}

.${CSS_PREFIX}-card-title {
	font-size: var(--${CSS_PREFIX}-text-2);
	font-weight: 400;
	color: var(--${CSS_PREFIX}-ink);
}

.${CSS_PREFIX}-card-desc {
	font-size: var(--${CSS_PREFIX}-text-1);
	color: var(--${CSS_PREFIX}-ink-2);
	margin-left: auto;
	text-align: right;
}

.${CSS_PREFIX}-card.selected .${CSS_PREFIX}-card-title,
.${CSS_PREFIX}-option.selected .${CSS_PREFIX}-option-label {
	font-weight: 600;
}

.${CSS_PREFIX}-option-label {
	flex: 1;
	font-size: var(--${CSS_PREFIX}-text-2);
	color: var(--${CSS_PREFIX}-ink);
}

.${CSS_PREFIX}-option-hint {
	font-size: var(--${CSS_PREFIX}-text-1);
	color: var(--${CSS_PREFIX}-ink-2);
}

/* ============================================
   Fields
   ============================================ */

.${CSS_PREFIX}-manual-input,
.${CSS_PREFIX}-date-range,
.${CSS_PREFIX}-channel-picker {
	display: none;
	margin-top: var(--${CSS_PREFIX}-space-3);
}

.${CSS_PREFIX}-manual-input.visible,
.${CSS_PREFIX}-channel-picker.visible {
	display: block;
}

.${CSS_PREFIX}-date-range.visible {
	display: flex;
	gap: var(--${CSS_PREFIX}-space-3);
}

.${CSS_PREFIX}-filter-input {
	margin-top: var(--${CSS_PREFIX}-space-4);
}

.${CSS_PREFIX}-filter-input label,
.${CSS_PREFIX}-form-group label,
.${CSS_PREFIX}-deletion-order-label,
.${CSS_PREFIX}-preview-label {
	display: block;
	font-size: var(--${CSS_PREFIX}-text-1);
	font-weight: 500;
	letter-spacing: 0.04em;
	color: var(--${CSS_PREFIX}-ink-2);
	margin-bottom: var(--${CSS_PREFIX}-space-2);
}

.${CSS_PREFIX}-manual-input input,
.${CSS_PREFIX}-date-range input,
.${CSS_PREFIX}-filter-input input,
.${CSS_PREFIX}-form-group input,
.${CSS_PREFIX}-channel-search {
	width: 100%;
	min-height: 40px;
	padding: var(--${CSS_PREFIX}-space-2) var(--${CSS_PREFIX}-space-3);
	background: var(--${CSS_PREFIX}-surface);
	border: 1px solid var(--${CSS_PREFIX}-line);
	border-radius: var(--${CSS_PREFIX}-radius);
	color: var(--${CSS_PREFIX}-ink);
	font-family: var(--${CSS_PREFIX}-face);
	font-size: var(--${CSS_PREFIX}-text-2);
	box-sizing: border-box;
	transition: border-color var(--${CSS_PREFIX}-motion) var(--${CSS_PREFIX}-ease);
}

.${CSS_PREFIX}-date-range input {
	flex: 1;
	width: auto;
}

.${CSS_PREFIX}-manual-input input:focus,
.${CSS_PREFIX}-date-range input:focus,
.${CSS_PREFIX}-filter-input input:focus,
.${CSS_PREFIX}-form-group input:focus,
.${CSS_PREFIX}-channel-search:focus {
	border-color: var(--${CSS_PREFIX}-signal);
}

.${CSS_PREFIX}-manual-input input::placeholder,
.${CSS_PREFIX}-date-range input::placeholder,
.${CSS_PREFIX}-filter-input input::placeholder,
.${CSS_PREFIX}-form-group input::placeholder,
.${CSS_PREFIX}-channel-search::placeholder {
	color: var(--${CSS_PREFIX}-ink-2);
	opacity: 1;
}

/* Toggles */
.${CSS_PREFIX}-toggles {
	display: flex;
	flex-direction: column;
}

.${CSS_PREFIX}-toggle {
	display: flex;
	align-items: center;
	justify-content: space-between;
	min-height: 44px;
	padding: var(--${CSS_PREFIX}-space-2) 0;
	border-bottom: 1px solid var(--${CSS_PREFIX}-line);
}

.${CSS_PREFIX}-toggle:last-child {
	border-bottom: none;
}

.${CSS_PREFIX}-toggle-label {
	font-size: var(--${CSS_PREFIX}-text-2);
	color: var(--${CSS_PREFIX}-ink);
}

.${CSS_PREFIX}-toggle-switch {
	width: 36px;
	height: 20px;
	background: var(--${CSS_PREFIX}-line);
	border-radius: 10px;
	cursor: pointer;
	position: relative;
	flex-shrink: 0;
	transition: background var(--${CSS_PREFIX}-motion) var(--${CSS_PREFIX}-ease);
}

.${CSS_PREFIX}-toggle-switch.on {
	background: var(--${CSS_PREFIX}-ink-2);
}

.${CSS_PREFIX}-toggle-switch::after {
	content: '';
	position: absolute;
	width: 14px;
	height: 14px;
	background: var(--${CSS_PREFIX}-ink-2);
	border-radius: 50%;
	top: 3px;
	left: 3px;
	transition: transform var(--${CSS_PREFIX}-motion) var(--${CSS_PREFIX}-ease),
		background var(--${CSS_PREFIX}-motion) var(--${CSS_PREFIX}-ease);
}

.${CSS_PREFIX}-toggle-switch.on::after {
	background: var(--${CSS_PREFIX}-ground);
	transform: translateX(16px);
}

/* Deletion order stays hidden while the oldest-first flow is redesigned. */
.${CSS_PREFIX}-deletion-order {
	display: none;
	margin-top: var(--${CSS_PREFIX}-space-4);
	padding-top: var(--${CSS_PREFIX}-space-4);
	border-top: 1px solid var(--${CSS_PREFIX}-line);
}

.${CSS_PREFIX}-deletion-order.visible {
	display: block;
}

.${CSS_PREFIX}-radio-group {
	display: flex;
	gap: var(--${CSS_PREFIX}-space-5);
}

.${CSS_PREFIX}-radio {
	display: flex;
	align-items: center;
	gap: var(--${CSS_PREFIX}-space-2);
	cursor: pointer;
}

.${CSS_PREFIX}-radio input[type="radio"] {
	width: 14px;
	height: 14px;
	margin: 0;
	accent-color: var(--${CSS_PREFIX}-signal);
	cursor: pointer;
}

.${CSS_PREFIX}-radio-label {
	font-size: var(--${CSS_PREFIX}-text-2);
	color: var(--${CSS_PREFIX}-ink);
}

/* Legacy markup that must never render. */
.${CSS_PREFIX}-checkbox-group {
	display: none;
}

/* ============================================
   Channel picker
   ============================================ */

.${CSS_PREFIX}-channel-search {
	margin-bottom: var(--${CSS_PREFIX}-space-2);
}

.${CSS_PREFIX}-channel-list {
	max-height: 200px;
	overflow-y: auto;
	border: 1px solid var(--${CSS_PREFIX}-line);
	border-radius: var(--${CSS_PREFIX}-radius);
	scrollbar-width: thin;
	scrollbar-color: var(--${CSS_PREFIX}-line) transparent;
}

.${CSS_PREFIX}-channel-item {
	display: flex;
	align-items: center;
	gap: var(--${CSS_PREFIX}-space-2);
	min-height: 36px;
	padding: var(--${CSS_PREFIX}-space-2) var(--${CSS_PREFIX}-space-3);
	border-bottom: 1px solid var(--${CSS_PREFIX}-line);
	border-left: 2px solid transparent;
	cursor: pointer;
	transition: background var(--${CSS_PREFIX}-motion) var(--${CSS_PREFIX}-ease);
}

.${CSS_PREFIX}-channel-item:last-child {
	border-bottom: none;
}

.${CSS_PREFIX}-channel-item:hover {
	background: var(--${CSS_PREFIX}-hover);
}

.${CSS_PREFIX}-channel-item.selected {
	background: transparent;
	border-left-color: var(--${CSS_PREFIX}-signal);
}

.${CSS_PREFIX}-channel-item.selected .${CSS_PREFIX}-channel-name {
	font-weight: 600;
}

.${CSS_PREFIX}-channel-checkbox {
	width: 14px;
	height: 14px;
	border: 1px solid var(--${CSS_PREFIX}-line);
	border-radius: 2px;
	display: flex;
	align-items: center;
	justify-content: center;
	flex-shrink: 0;
	transition: background var(--${CSS_PREFIX}-motion) var(--${CSS_PREFIX}-ease),
		border-color var(--${CSS_PREFIX}-motion) var(--${CSS_PREFIX}-ease);
}

.${CSS_PREFIX}-channel-item.selected .${CSS_PREFIX}-channel-checkbox {
	background: var(--${CSS_PREFIX}-signal);
	border-color: var(--${CSS_PREFIX}-signal);
}

.${CSS_PREFIX}-channel-item.selected .${CSS_PREFIX}-channel-checkbox::after {
	content: '✓';
	color: var(--${CSS_PREFIX}-on-signal);
	font-size: 10px;
	line-height: 1;
}

.${CSS_PREFIX}-channel-icon {
	color: var(--${CSS_PREFIX}-ink-2);
	font-size: var(--${CSS_PREFIX}-text-2);
}

.${CSS_PREFIX}-channel-name {
	flex: 1;
	color: var(--${CSS_PREFIX}-ink);
	font-size: var(--${CSS_PREFIX}-text-2);
	white-space: nowrap;
	overflow: hidden;
	text-overflow: ellipsis;
}

.${CSS_PREFIX}-channel-loading {
	display: flex;
	align-items: center;
	justify-content: center;
	gap: var(--${CSS_PREFIX}-space-2);
	padding: var(--${CSS_PREFIX}-space-5);
	color: var(--${CSS_PREFIX}-ink-2);
	font-size: var(--${CSS_PREFIX}-text-1);
}

.${CSS_PREFIX}-selected-count {
	font-size: var(--${CSS_PREFIX}-text-1);
	color: var(--${CSS_PREFIX}-ink-2);
	margin-top: var(--${CSS_PREFIX}-space-2);
}

/* ============================================
   Review
   ============================================ */

.${CSS_PREFIX}-summary {
	background: transparent;
	border: none;
	border-radius: 0;
	padding: 0;
	text-align: left;
	margin-bottom: var(--${CSS_PREFIX}-space-4);
}

.${CSS_PREFIX}-summary-count {
	font-size: var(--${CSS_PREFIX}-text-hero);
	font-weight: 700;
	letter-spacing: -0.02em;
	line-height: 1.05;
	color: var(--${CSS_PREFIX}-ink);
}

.${CSS_PREFIX}-summary-label {
	font-size: var(--${CSS_PREFIX}-text-1);
	font-weight: 500;
	letter-spacing: 0.04em;
	color: var(--${CSS_PREFIX}-ink-2);
	margin-top: var(--${CSS_PREFIX}-space-1);
}

.${CSS_PREFIX}-summary-details {
	font-size: var(--${CSS_PREFIX}-text-1);
	color: var(--${CSS_PREFIX}-ink-2);
	margin-top: var(--${CSS_PREFIX}-space-2);
}

.${CSS_PREFIX}-review-summary {
	display: grid;
	grid-template-columns: max-content 1fr;
	margin: 0 0 var(--${CSS_PREFIX}-space-4);
	padding: 0;
	background: transparent;
	border: none;
	font-size: var(--${CSS_PREFIX}-text-1);
}

.${CSS_PREFIX}-review-summary dt,
.${CSS_PREFIX}-review-summary dd {
	padding: var(--${CSS_PREFIX}-space-2) 0;
	border-bottom: 1px dashed var(--${CSS_PREFIX}-line);
}

.${CSS_PREFIX}-review-summary dt {
	font-weight: 500;
	letter-spacing: 0.04em;
	color: var(--${CSS_PREFIX}-ink-2);
}

.${CSS_PREFIX}-review-summary dd {
	margin: 0;
	padding-left: var(--${CSS_PREFIX}-space-4);
	color: var(--${CSS_PREFIX}-ink);
	text-align: right;
	word-break: break-word;
}

.${CSS_PREFIX}-preview-list {
	margin-top: var(--${CSS_PREFIX}-space-4);
}

.${CSS_PREFIX}-preview-messages {
	background: transparent;
	border-radius: 0;
	padding: 0;
	max-height: 132px;
	overflow-y: auto;
	scrollbar-width: thin;
	scrollbar-color: var(--${CSS_PREFIX}-line) transparent;
}

.${CSS_PREFIX}-preview-msg {
	padding: var(--${CSS_PREFIX}-space-2) 0;
	border-bottom: 1px solid var(--${CSS_PREFIX}-line);
	font-size: var(--${CSS_PREFIX}-text-1);
	color: var(--${CSS_PREFIX}-ink-2);
	white-space: nowrap;
	overflow: hidden;
	text-overflow: ellipsis;
}

.${CSS_PREFIX}-preview-msg:last-child {
	border-bottom: none;
}

/* ============================================
   Buttons
   ============================================ */

.${CSS_PREFIX}-btn {
	display: inline-flex;
	align-items: center;
	justify-content: center;
	gap: var(--${CSS_PREFIX}-space-2);
	min-height: 44px;
	padding: 0 var(--${CSS_PREFIX}-space-4);
	border: 1px solid transparent;
	border-radius: var(--${CSS_PREFIX}-radius);
	font-family: var(--${CSS_PREFIX}-face);
	font-size: var(--${CSS_PREFIX}-text-2);
	font-weight: 600;
	cursor: pointer;
	transition: background var(--${CSS_PREFIX}-motion) var(--${CSS_PREFIX}-ease),
		border-color var(--${CSS_PREFIX}-motion) var(--${CSS_PREFIX}-ease),
		color var(--${CSS_PREFIX}-motion) var(--${CSS_PREFIX}-ease);
}

.${CSS_PREFIX}-btn-group {
	display: flex;
	gap: var(--${CSS_PREFIX}-space-3);
	margin-top: var(--${CSS_PREFIX}-space-5);
}

/* The signal colour is reserved for the irreversible action; Continue is neutral. */
.${CSS_PREFIX}-btn-primary {
	background: var(--${CSS_PREFIX}-hover);
	border-color: var(--${CSS_PREFIX}-line);
	color: var(--${CSS_PREFIX}-ink);
	font-weight: 600;
}

.${CSS_PREFIX}-btn-primary:hover {
	border-color: var(--${CSS_PREFIX}-ink-2);
}

.${CSS_PREFIX}-btn-sweep {
	background: var(--${CSS_PREFIX}-signal);
	border-color: var(--${CSS_PREFIX}-signal-edge);
	color: var(--${CSS_PREFIX}-on-signal);
	font-weight: 600;
}

.${CSS_PREFIX}-btn-sweep:hover {
	background: var(--${CSS_PREFIX}-signal-hover);
}

.${CSS_PREFIX}-btn-secondary {
	background: transparent;
	border-color: var(--${CSS_PREFIX}-line);
	color: var(--${CSS_PREFIX}-ink);
}

.${CSS_PREFIX}-btn-secondary:hover {
	background: var(--${CSS_PREFIX}-hover);
}

.${CSS_PREFIX}-btn-ghost {
	background: transparent;
	color: var(--${CSS_PREFIX}-ink-2);
}

.${CSS_PREFIX}-btn-ghost:hover {
	color: var(--${CSS_PREFIX}-ink);
	background: var(--${CSS_PREFIX}-hover);
}

/* Stopping a run is destructive, whichever button variant carries it. */
.${CSS_PREFIX}-btn-danger,
.${CSS_PREFIX}-btn[data-action="stop"],
.${CSS_PREFIX}-btn[data-action="stopRun"] {
	background: transparent;
	border-color: var(--${CSS_PREFIX}-failed);
	color: var(--${CSS_PREFIX}-failed-ink);
}

.${CSS_PREFIX}-btn-danger:hover,
.${CSS_PREFIX}-btn[data-action="stop"]:hover,
.${CSS_PREFIX}-btn[data-action="stopRun"]:hover {
	background: transparent;
	box-shadow: inset 0 0 0 1px var(--${CSS_PREFIX}-failed);
}

.${CSS_PREFIX}-btn:disabled,
.${CSS_PREFIX}-btn[disabled] {
	opacity: 0.4;
	cursor: not-allowed;
}

.${CSS_PREFIX}-status-message {
	font-size: var(--${CSS_PREFIX}-text-2);
	color: var(--${CSS_PREFIX}-ink-2);
}

.${CSS_PREFIX}-channel-progress {
	margin-bottom: var(--${CSS_PREFIX}-space-2);
	font-size: var(--${CSS_PREFIX}-text-1);
	font-weight: 500;
	letter-spacing: 0.04em;
	color: var(--${CSS_PREFIX}-ink-2);
}

.${CSS_PREFIX}-channel-progress:empty {
	display: none;
}

.${CSS_PREFIX}-progress-container {
	display: flex;
	flex-direction: column;
	align-items: center;
	padding: var(--${CSS_PREFIX}-space-2) 0 0;
}

.${CSS_PREFIX}-progress-ring {
	width: 100%;
	height: 100%;
	transform: rotate(-90deg);
}

.${CSS_PREFIX}-progress-percent {
	font-size: var(--${CSS_PREFIX}-text-hero);
	font-weight: 700;
	letter-spacing: -0.02em;
	line-height: 1.05;
	color: var(--${CSS_PREFIX}-ink);
}

.${CSS_PREFIX}-progress-count {
	font-size: var(--${CSS_PREFIX}-text-1);
	color: var(--${CSS_PREFIX}-ink-2);
	margin-top: var(--${CSS_PREFIX}-space-1);
}

/* Stats are one row of figure and label pairs, not tiles. */
.${CSS_PREFIX}-progress-stats {
	display: flex;
	flex-wrap: wrap;
	gap: var(--${CSS_PREFIX}-space-2) var(--${CSS_PREFIX}-space-5);
	width: 100%;
	margin-top: var(--${CSS_PREFIX}-space-4);
	padding-top: var(--${CSS_PREFIX}-space-3);
	border-top: 1px solid var(--${CSS_PREFIX}-line);
}

.${CSS_PREFIX}-stat {
	display: flex;
	align-items: baseline;
	gap: var(--${CSS_PREFIX}-space-2);
	background: transparent;
	border: none;
	border-radius: 0;
	padding: 0;
	text-align: left;
}

.${CSS_PREFIX}-stat-value {
	font-size: var(--${CSS_PREFIX}-text-3);
	font-weight: 600;
	color: var(--${CSS_PREFIX}-ink);
	order: 2;
}

.${CSS_PREFIX}-stat-value.success { color: var(--${CSS_PREFIX}-deleted-ink); }
.${CSS_PREFIX}-stat-value.error { color: var(--${CSS_PREFIX}-failed-ink); }
.${CSS_PREFIX}-stat-value.rate { color: var(--${CSS_PREFIX}-ink); }

.${CSS_PREFIX}-stat-label {
	font-size: var(--${CSS_PREFIX}-text-1);
	font-weight: 500;
	letter-spacing: 0.04em;
	color: var(--${CSS_PREFIX}-ink-2);
	margin: 0;
	order: 1;
}

.${CSS_PREFIX}-time-stats {
	display: flex;
	gap: var(--${CSS_PREFIX}-space-5);
	width: 100%;
	margin-top: var(--${CSS_PREFIX}-space-3);
	padding-top: var(--${CSS_PREFIX}-space-3);
	border-top: 1px solid var(--${CSS_PREFIX}-line);
}

.${CSS_PREFIX}-time-stat {
	display: flex;
	gap: var(--${CSS_PREFIX}-space-2);
	font-size: var(--${CSS_PREFIX}-text-1);
}

.${CSS_PREFIX}-time-label {
	font-weight: 500;
	letter-spacing: 0.04em;
	color: var(--${CSS_PREFIX}-ink-2);
}

.${CSS_PREFIX}-time-value {
	color: var(--${CSS_PREFIX}-ink);
	font-weight: 600;
}

.${CSS_PREFIX}-progress-bar-container {
	width: 100%;
	height: 2px;
	background: var(--${CSS_PREFIX}-line);
	overflow: hidden;
	margin-top: var(--${CSS_PREFIX}-space-4);
}

.${CSS_PREFIX}-progress-bar {
	height: 100%;
	background: var(--${CSS_PREFIX}-signal);
	transition: width var(--${CSS_PREFIX}-motion-slow) var(--${CSS_PREFIX}-ease);
}

.${CSS_PREFIX}-waiting {
	display: flex;
	align-items: center;
	gap: var(--${CSS_PREFIX}-space-2);
	margin-top: var(--${CSS_PREFIX}-space-3);
	padding: var(--${CSS_PREFIX}-space-2) var(--${CSS_PREFIX}-space-3);
	border: 1px solid var(--${CSS_PREFIX}-line);
	border-left: 2px solid var(--${CSS_PREFIX}-signal);
	border-radius: var(--${CSS_PREFIX}-radius);
	background: transparent;
	color: var(--${CSS_PREFIX}-ink-2);
	font-size: var(--${CSS_PREFIX}-text-1);
}

/* ============================================
   Live feed
   ============================================ */

.${CSS_PREFIX}-feed {
	margin-top: var(--${CSS_PREFIX}-space-5);
	max-height: 140px;
	overflow-y: auto;
	background: transparent;
	border-top: 1px solid var(--${CSS_PREFIX}-line);
	scrollbar-width: thin;
	scrollbar-color: var(--${CSS_PREFIX}-line) transparent;
}

.${CSS_PREFIX}-feed-entry {
	padding: var(--${CSS_PREFIX}-space-1) 0;
	border-bottom: 1px solid var(--${CSS_PREFIX}-line);
	font-family: var(--${CSS_PREFIX}-face);
	font-size: var(--${CSS_PREFIX}-text-1);
	color: var(--${CSS_PREFIX}-ink);
	white-space: nowrap;
	overflow: hidden;
	text-overflow: ellipsis;
}

.${CSS_PREFIX}-feed-entry:last-child {
	border-bottom: none;
}

/* Outcome colours. Where the view splits the tag out, only the tag is
   tinted and the message stays ink. */
.${CSS_PREFIX}-feed-deleted { color: var(--${CSS_PREFIX}-deleted-ink); }
.${CSS_PREFIX}-feed-failed { color: var(--${CSS_PREFIX}-failed-ink); }
.${CSS_PREFIX}-feed-skipped { color: var(--${CSS_PREFIX}-ink-2); }
.${CSS_PREFIX}-feed-already-gone {
	color: var(--${CSS_PREFIX}-ink-2);
	font-style: italic;
}

/* ============================================
   Completion, errors, prompts
   ============================================ */

.${CSS_PREFIX}-complete {
	padding: var(--${CSS_PREFIX}-space-6) 0;
}

.${CSS_PREFIX}-complete-icon {
	font-size: var(--${CSS_PREFIX}-text-4);
	line-height: 1;
	margin-bottom: var(--${CSS_PREFIX}-space-3);
}

.${CSS_PREFIX}-complete-title {
	font-size: var(--${CSS_PREFIX}-text-4);
	font-weight: 600;
	color: var(--${CSS_PREFIX}-ink);
	margin: 0 0 var(--${CSS_PREFIX}-space-2);
}

.${CSS_PREFIX}-complete-stats {
	font-size: var(--${CSS_PREFIX}-text-2);
	color: var(--${CSS_PREFIX}-ink);
}

.${CSS_PREFIX}-complete-detail {
	margin-top: var(--${CSS_PREFIX}-space-3);
	font-size: var(--${CSS_PREFIX}-text-1);
	color: var(--${CSS_PREFIX}-ink-2);
	word-break: break-word;
}

.${CSS_PREFIX}-error-message {
	padding: var(--${CSS_PREFIX}-space-3) 0 var(--${CSS_PREFIX}-space-3) var(--${CSS_PREFIX}-space-3);
	background: transparent;
	border: none;
	border-left: 2px solid var(--${CSS_PREFIX}-failed);
	border-radius: 0;
	color: var(--${CSS_PREFIX}-ink);
	margin-bottom: var(--${CSS_PREFIX}-space-4);
}

.${CSS_PREFIX}-form-group {
	margin-bottom: var(--${CSS_PREFIX}-space-4);
}

.${CSS_PREFIX}-inline-error {
	display: none;
	margin: var(--${CSS_PREFIX}-space-2) 0 0;
	padding: 0 0 0 var(--${CSS_PREFIX}-space-3);
	border-left: 2px solid var(--${CSS_PREFIX}-failed);
	background: transparent;
	color: var(--${CSS_PREFIX}-failed-ink);
	font-size: var(--${CSS_PREFIX}-text-1);
}

.${CSS_PREFIX}-inline-error.visible {
	display: block;
}

.${CSS_PREFIX}-resume {
	display: none;
	margin-bottom: var(--${CSS_PREFIX}-space-4);
	padding: var(--${CSS_PREFIX}-space-3);
	border: 1px solid var(--${CSS_PREFIX}-line);
	border-radius: var(--${CSS_PREFIX}-radius);
	background: transparent;
}

.${CSS_PREFIX}-resume.visible {
	display: block;
}

.${CSS_PREFIX}-resume-text {
	margin-bottom: var(--${CSS_PREFIX}-space-2);
	font-size: var(--${CSS_PREFIX}-text-2);
	color: var(--${CSS_PREFIX}-ink);
}

.${CSS_PREFIX}-run-choice {
	display: none;
	padding: var(--${CSS_PREFIX}-space-3) var(--${CSS_PREFIX}-pad);
	border-bottom: 1px solid var(--${CSS_PREFIX}-line);
	background: var(--${CSS_PREFIX}-surface);
}

.${CSS_PREFIX}-run-choice.visible {
	display: block;
}

.${CSS_PREFIX}-run-choice-text {
	margin-bottom: var(--${CSS_PREFIX}-space-2);
	font-size: var(--${CSS_PREFIX}-text-2);
	color: var(--${CSS_PREFIX}-ink);
}

.${CSS_PREFIX}-run-choice .${CSS_PREFIX}-btn-group {
	margin-top: 0;
}

/* Shake and flash are no-ops: the class names stay so the effects module
   keeps working until its calls are removed. */
.${CSS_PREFIX}-window.shaking,
.${CSS_PREFIX}-window .shaking {
	animation: none;
}

.${CSS_PREFIX}-window .flash-overlay {
	display: none;
}

/* ============================================
   Adaptation
   ============================================ */

@container ${CSS_PREFIX}-window (max-width: 400px) {
	.${CSS_PREFIX}-window {
		--${CSS_PREFIX}-pad: var(--${CSS_PREFIX}-space-3);
	}

	.${CSS_PREFIX}-progress-stats,
	.${CSS_PREFIX}-time-stats {
		gap: var(--${CSS_PREFIX}-space-2) var(--${CSS_PREFIX}-space-4);
	}
}

@media (prefers-reduced-motion: reduce) {
	${ROOT} {
		--${CSS_PREFIX}-motion: 1ms;
		--${CSS_PREFIX}-motion-slow: 1ms;
	}

	.${CSS_PREFIX}-trigger,
	.${CSS_PREFIX}-mini-indicator,
	.${CSS_PREFIX}-window,
	.${CSS_PREFIX}-window *,
	.${CSS_PREFIX}-window *::before,
	.${CSS_PREFIX}-window *::after {
		transition: none !important;
		animation: none !important;
	}
}
`;
