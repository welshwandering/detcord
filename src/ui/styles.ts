/**
 * High-performance UI styles for Detcord
 *
 * Design principles:
 * - Uses Discord's CSS custom properties for automatic theme compatibility
 * - Transform-based animations for GPU acceleration
 * - Minimal repaints/reflows
 * - Single specificity level where possible
 */

// =============================================================================
// CSS CUSTOM PROPERTIES
// =============================================================================

/**
 * Detcord-specific CSS variables that extend Discord's theme
 * These provide fallbacks and computed values
 */
const CSS_VARIABLES = `
:root {
	/* Detcord-specific overrides and computed values */
	--detcord-window-width: 480px;
	--detcord-header-height: 48px;
	--detcord-content-padding: 16px;
	--detcord-border-radius: 6px;
	--detcord-border-radius-sm: 4px;
	--detcord-border-radius-lg: 10px;
	--detcord-transition-fast: 0.15s ease;
	--detcord-transition-normal: 0.2s ease;
	--detcord-transition-slow: 0.35s ease;
	--detcord-shadow-elevation-low: 0 2px 10px rgba(0, 0, 0, 0.2);
	--detcord-shadow-elevation-high: 0 8px 32px rgba(0, 0, 0, 0.4);
	--detcord-progress-stroke-width: 8;
	--detcord-progress-size: 120px;
}
`;

// =============================================================================
// TOOLBAR BUTTON STYLES
// =============================================================================

/**
 * Styles for the toolbar button that launches Detcord
 * Matches Discord's toolbar icon button design
 */
export const BUTTON_CSS = `
#detcord-btn {
	display: flex;
	align-items: center;
	justify-content: center;
	position: relative;
	width: 24px;
	height: 24px;
	margin: 0 4px;
	padding: 4px;
	background: transparent;
	border: none;
	border-radius: 4px;
	color: var(--interactive-normal, #b5bac1);
	cursor: pointer;
	transition: color var(--detcord-transition-fast, 0.15s ease);
}

#detcord-btn:hover {
	color: var(--interactive-hover, #dbdee1);
}

#detcord-btn:active {
	color: var(--interactive-active, #f2f3f5);
}

#detcord-btn svg {
	width: 20px;
	height: 20px;
	fill: currentColor;
}

/* Running state indicator - pulsing dot */
#detcord-btn::after {
	content: '';
	position: absolute;
	top: 2px;
	right: 2px;
	width: 8px;
	height: 8px;
	background: var(--status-danger, #ed4245);
	border-radius: 50%;
	opacity: 0;
	transform: scale(0);
	transition: transform var(--detcord-transition-fast, 0.15s ease),
		opacity var(--detcord-transition-fast, 0.15s ease);
}

#detcord-btn.running::after {
	opacity: 1;
	transform: scale(1);
	animation: detcord-pulse 1.5s ease-in-out infinite;
}

@keyframes detcord-pulse {
	0%, 100% {
		opacity: 1;
		transform: scale(1);
	}
	50% {
		opacity: 0.6;
		transform: scale(0.85);
	}
}
`;

// =============================================================================
// MAIN WINDOW STYLES
// =============================================================================

/**
 * Floating window container and header styles
 */
export const WINDOW_CSS = `
/* Window container */
#detcord {
	position: fixed;
	z-index: 1000;
	top: 50%;
	left: 50%;
	width: var(--detcord-window-width, 480px);
	max-width: calc(100vw - 32px);
	max-height: calc(100vh - 32px);
	background: var(--background-primary, #313338);
	border-radius: var(--detcord-border-radius-lg, 12px);
	box-shadow: var(--detcord-shadow-elevation-high, 0 8px 32px rgba(0, 0, 0, 0.4));
	overflow: hidden;
	transform: translate(-50%, -50%) scale(1);
	opacity: 1;
	animation: detcord-window-open 0.2s ease-out;
	will-change: transform, opacity;
}

#detcord.closing {
	animation: detcord-window-close 0.15s ease-in forwards;
}

@keyframes detcord-window-open {
	from {
		opacity: 0;
		transform: translate(-50%, -50%) scale(0.95);
	}
	to {
		opacity: 1;
		transform: translate(-50%, -50%) scale(1);
	}
}

@keyframes detcord-window-close {
	from {
		opacity: 1;
		transform: translate(-50%, -50%) scale(1);
	}
	to {
		opacity: 0;
		transform: translate(-50%, -50%) scale(0.95);
	}
}

/* Header / Title bar */
#detcord .header {
	display: flex;
	align-items: center;
	height: var(--detcord-header-height, 48px);
	padding: 0 12px;
	background: var(--background-secondary, #2b2d31);
	cursor: grab;
	user-select: none;
}

#detcord .header:active {
	cursor: grabbing;
}

#detcord .header-icon {
	width: 20px;
	height: 20px;
	margin-right: 10px;
	fill: var(--text-normal, #dbdee1);
}

#detcord .header-title {
	flex: 1;
	font-size: 14px;
	font-weight: 600;
	color: var(--header-primary, #f2f3f5);
	line-height: 1;
}

#detcord .header-close {
	display: flex;
	align-items: center;
	justify-content: center;
	width: 32px;
	height: 32px;
	margin-left: 8px;
	padding: 0;
	background: transparent;
	border: none;
	border-radius: 4px;
	color: var(--interactive-normal, #b5bac1);
	cursor: pointer;
	transition: background-color var(--detcord-transition-fast, 0.15s ease),
		color var(--detcord-transition-fast, 0.15s ease);
}

#detcord .header-close:hover {
	background: var(--background-modifier-hover, #3c3f45);
	color: var(--interactive-hover, #dbdee1);
}

#detcord .header-close:active {
	background: var(--background-modifier-active, #43464d);
}

#detcord .header-close svg {
	width: 18px;
	height: 18px;
	fill: currentColor;
}

/* Content area */
#detcord .content {
	position: relative;
	padding: var(--detcord-content-padding, 20px);
	max-height: calc(100vh - 200px);
	overflow-y: auto;
	overflow-x: hidden;
	scrollbar-width: thin;
	scrollbar-color: var(--scrollbar-thin-thumb, #1a1b1e) transparent;
}

#detcord .content::-webkit-scrollbar {
	width: 8px;
}

#detcord .content::-webkit-scrollbar-track {
	background: transparent;
}

#detcord .content::-webkit-scrollbar-thumb {
	background: var(--scrollbar-thin-thumb, #1a1b1e);
	border-radius: var(--detcord-border-radius-sm, 4px);
}

#detcord .content::-webkit-scrollbar-thumb:hover {
	background: var(--scrollbar-thin-track, #2b2d31);
}
`;

// =============================================================================
// SCREEN CONTAINER STYLES
// =============================================================================

/**
 * Screen container styles for wizard-style navigation
 */
const SCREEN_CSS = `
/* Screen containers */
#detcord .screen {
	display: none;
	opacity: 0;
}

#detcord .screen.active {
	display: block;
	opacity: 1;
	animation: detcord-screen-enter 0.2s ease-out;
}

#detcord .screen.exiting {
	animation: detcord-screen-exit 0.15s ease-in;
}

@keyframes detcord-screen-enter {
	from {
		opacity: 0;
		transform: translateX(20px);
	}
	to {
		opacity: 1;
		transform: translateX(0);
	}
}

@keyframes detcord-screen-exit {
	from {
		opacity: 1;
		transform: translateX(0);
	}
	to {
		opacity: 0;
		transform: translateX(-20px);
	}
}

/* Screen titles and subtitles */
#detcord .screen-title {
	margin: 0 0 4px;
	font-size: 18px;
	font-weight: 600;
	color: var(--header-primary, #f2f3f5);
	line-height: 1.2;
}

#detcord .screen-subtitle {
	margin: 0 0 12px;
	font-size: 13px;
	color: var(--text-muted, #949ba4);
	line-height: 1.4;
}
`;

// =============================================================================
// OPTION CARD STYLES
// =============================================================================

/**
 * Radio-style option cards for target selection
 */
const OPTION_CARD_CSS = `
/* Option cards container */
#detcord .option-cards {
	display: flex;
	flex-direction: column;
	gap: 8px;
}

/* Individual option card */
#detcord .option-card {
	display: flex;
	align-items: flex-start;
	padding: 12px;
	background: var(--background-secondary-alt, #232428);
	border: 2px solid var(--background-modifier-accent, #4e5058);
	border-radius: var(--detcord-border-radius, 6px);
	cursor: pointer;
	transition: border-color var(--detcord-transition-fast, 0.15s ease),
		background-color var(--detcord-transition-fast, 0.15s ease);
}

#detcord .option-card:hover {
	border-color: var(--brand-experiment, #5865f2);
	background: var(--background-modifier-hover, #3c3f45);
}

#detcord .option-card.selected {
	border-color: var(--brand-experiment, #5865f2);
	background: rgba(88, 101, 242, 0.1);
}

#detcord .option-card.disabled {
	opacity: 0.5;
	pointer-events: none;
	cursor: not-allowed;
}

/* Radio indicator */
#detcord .option-card .radio {
	position: relative;
	flex-shrink: 0;
	width: 20px;
	height: 20px;
	margin-right: 12px;
	margin-top: 2px;
	border: 2px solid var(--interactive-normal, #b5bac1);
	border-radius: 50%;
	transition: border-color var(--detcord-transition-fast, 0.15s ease);
}

#detcord .option-card.selected .radio {
	border-color: var(--brand-experiment, #5865f2);
}

#detcord .option-card .radio::after {
	content: '';
	position: absolute;
	top: 50%;
	left: 50%;
	width: 10px;
	height: 10px;
	background: var(--brand-experiment, #5865f2);
	border-radius: 50%;
	opacity: 0;
	transform: translate(-50%, -50%) scale(0);
	transition: transform var(--detcord-transition-fast, 0.15s ease),
		opacity var(--detcord-transition-fast, 0.15s ease);
}

#detcord .option-card.selected .radio::after {
	opacity: 1;
	transform: translate(-50%, -50%) scale(1);
}

/* Option content */
#detcord .option-card .option-content {
	flex: 1;
	min-width: 0;
}

#detcord .option-card .option-title {
	font-size: 16px;
	font-weight: 500;
	color: var(--text-normal, #dbdee1);
	line-height: 1.25;
}

#detcord .option-card .option-desc {
	margin-top: 4px;
	font-size: 13px;
	color: var(--text-muted, #949ba4);
	line-height: 1.4;
}

/* Option icon */
#detcord .option-card .option-icon {
	flex-shrink: 0;
	width: 20px;
	height: 20px;
	margin-left: 12px;
	fill: var(--text-muted, #949ba4);
}
`;

// =============================================================================
// FORM INPUT STYLES
// =============================================================================

/**
 * Form input styles matching Discord's design
 */
const FORM_CSS = `
/* Form groups */
#detcord .form-group {
	margin-bottom: 12px;
}

#detcord .form-label {
	display: block;
	margin-bottom: 6px;
	font-size: 11px;
	font-weight: 600;
	color: var(--header-secondary, #b5bac1);
	text-transform: uppercase;
	letter-spacing: 0.02em;
}

#detcord .form-label .optional {
	font-weight: 400;
	color: var(--text-muted, #949ba4);
	text-transform: none;
}

/* Text inputs */
#detcord input[type="text"],
#detcord input[type="password"],
#detcord input[type="datetime-local"],
#detcord input[type="number"],
#detcord textarea {
	display: block;
	width: 100%;
	padding: 8px 10px;
	background: var(--input-background, #1e1f22);
	border: 1px solid transparent;
	border-radius: var(--detcord-border-radius, 6px);
	color: var(--text-normal, #dbdee1);
	font-size: 13px;
	font-family: inherit;
	line-height: 1.4;
	outline: none;
	transition: border-color var(--detcord-transition-fast, 0.15s ease),
		box-shadow var(--detcord-transition-fast, 0.15s ease);
	box-sizing: border-box;
}

#detcord input[type="text"]::placeholder,
#detcord input[type="password"]::placeholder,
#detcord textarea::placeholder {
	color: var(--text-muted, #949ba4);
}

#detcord input[type="text"]:focus,
#detcord input[type="password"]:focus,
#detcord input[type="datetime-local"]:focus,
#detcord input[type="number"]:focus,
#detcord textarea:focus {
	border-color: var(--brand-experiment, #5865f2);
	box-shadow: 0 0 0 2px rgba(88, 101, 242, 0.25);
}

#detcord input[type="text"]:disabled,
#detcord input[type="password"]:disabled,
#detcord input[type="datetime-local"]:disabled,
#detcord input[type="number"]:disabled,
#detcord textarea:disabled {
	opacity: 0.5;
	cursor: not-allowed;
}

#detcord textarea {
	min-height: 80px;
	resize: vertical;
}

/* Datetime-local custom styling */
#detcord input[type="datetime-local"]::-webkit-calendar-picker-indicator {
	filter: invert(0.7);
	cursor: pointer;
}

/* Checkbox styling */
#detcord .checkbox-group {
	display: flex;
	flex-wrap: wrap;
	gap: 16px;
	margin-bottom: 16px;
}

#detcord .checkbox-item {
	display: flex;
	align-items: center;
	gap: 8px;
	cursor: pointer;
}

#detcord .checkbox-item input[type="checkbox"] {
	position: relative;
	width: 20px;
	height: 20px;
	margin: 0;
	padding: 0;
	background: var(--input-background, #1e1f22);
	border: 2px solid var(--interactive-normal, #b5bac1);
	border-radius: 4px;
	cursor: pointer;
	appearance: none;
	-webkit-appearance: none;
	transition: background-color var(--detcord-transition-fast, 0.15s ease),
		border-color var(--detcord-transition-fast, 0.15s ease);
}

#detcord .checkbox-item input[type="checkbox"]:hover {
	border-color: var(--interactive-hover, #dbdee1);
}

#detcord .checkbox-item input[type="checkbox"]:checked {
	background: var(--brand-experiment, #5865f2);
	border-color: var(--brand-experiment, #5865f2);
}

#detcord .checkbox-item input[type="checkbox"]:checked::after {
	content: '';
	position: absolute;
	top: 3px;
	left: 6px;
	width: 4px;
	height: 8px;
	border: solid white;
	border-width: 0 2px 2px 0;
	transform: rotate(45deg);
}

#detcord .checkbox-item input[type="checkbox"]:focus {
	box-shadow: 0 0 0 2px rgba(88, 101, 242, 0.25);
}

#detcord .checkbox-item label {
	font-size: 14px;
	color: var(--text-normal, #dbdee1);
	cursor: pointer;
}

/* Radio button styling */
#detcord .detcord-radio-group {
	display: flex;
	gap: 16px;
}

#detcord .detcord-radio {
	display: flex;
	align-items: center;
	gap: 6px;
	cursor: pointer;
}

#detcord .detcord-radio input[type="radio"] {
	position: relative;
	width: 18px;
	height: 18px;
	margin: 0;
	padding: 0;
	background: var(--input-background, #1e1f22);
	border: 2px solid var(--interactive-normal, #b5bac1);
	border-radius: 50%;
	cursor: pointer;
	appearance: none;
	-webkit-appearance: none;
	transition: background-color var(--detcord-transition-fast, 0.15s ease),
		border-color var(--detcord-transition-fast, 0.15s ease);
}

#detcord .detcord-radio input[type="radio"]:hover {
	border-color: var(--interactive-hover, #dbdee1);
}

#detcord .detcord-radio input[type="radio"]:checked {
	background: var(--brand-experiment, #5865f2);
	border-color: var(--brand-experiment, #5865f2);
}

#detcord .detcord-radio input[type="radio"]:checked::after {
	content: '';
	position: absolute;
	top: 4px;
	left: 4px;
	width: 6px;
	height: 6px;
	background: white;
	border-radius: 50%;
}

#detcord .detcord-radio input[type="radio"]:focus {
	box-shadow: 0 0 0 2px rgba(88, 101, 242, 0.25);
}

#detcord .detcord-radio-label {
	font-size: 13px;
	color: var(--text-normal, #dbdee1);
}

/* Range slider styling */
#detcord input[type="range"] {
	width: 100%;
	height: 8px;
	margin: 8px 0;
	padding: 0;
	background: transparent;
	border: none;
	outline: none;
	appearance: none;
	-webkit-appearance: none;
}

#detcord input[type="range"]::-webkit-slider-runnable-track {
	width: 100%;
	height: 8px;
	background: var(--background-modifier-accent, #4e5058);
	border-radius: 4px;
	cursor: pointer;
}

#detcord input[type="range"]::-webkit-slider-thumb {
	width: 20px;
	height: 20px;
	margin-top: -6px;
	background: var(--brand-experiment, #5865f2);
	border: none;
	border-radius: 50%;
	cursor: pointer;
	appearance: none;
	-webkit-appearance: none;
	box-shadow: 0 2px 4px rgba(0, 0, 0, 0.3);
	transition: transform var(--detcord-transition-fast, 0.15s ease);
}

#detcord input[type="range"]::-webkit-slider-thumb:hover {
	transform: scale(1.1);
}

#detcord input[type="range"]::-webkit-slider-thumb:active {
	transform: scale(0.95);
}

#detcord input[type="range"]::-moz-range-track {
	width: 100%;
	height: 8px;
	background: var(--background-modifier-accent, #4e5058);
	border-radius: 4px;
	cursor: pointer;
}

#detcord input[type="range"]::-moz-range-thumb {
	width: 20px;
	height: 20px;
	background: var(--brand-experiment, #5865f2);
	border: none;
	border-radius: 50%;
	cursor: pointer;
	box-shadow: 0 2px 4px rgba(0, 0, 0, 0.3);
}

#detcord .range-display {
	display: flex;
	justify-content: space-between;
	margin-top: 4px;
	font-size: 12px;
	color: var(--text-muted, #949ba4);
}

/* Form hint text */
#detcord .form-hint {
	margin-top: 6px;
	font-size: 12px;
	color: var(--text-muted, #949ba4);
	line-height: 1.4;
}

/* Form error */
#detcord .form-error {
	margin-top: 6px;
	font-size: 12px;
	color: var(--status-danger, #ed4245);
	line-height: 1.4;
}

/* Collapsible sections */
#detcord .collapsible {
	margin-bottom: 16px;
}

#detcord .collapsible-header {
	display: flex;
	align-items: center;
	padding: 12px 0;
	color: var(--text-muted, #949ba4);
	font-size: 12px;
	font-weight: 600;
	text-transform: uppercase;
	letter-spacing: 0.02em;
	cursor: pointer;
	transition: color var(--detcord-transition-fast, 0.15s ease);
}

#detcord .collapsible-header:hover {
	color: var(--text-normal, #dbdee1);
}

#detcord .collapsible-header svg {
	width: 16px;
	height: 16px;
	margin-right: 8px;
	fill: currentColor;
	transition: transform var(--detcord-transition-fast, 0.15s ease);
}

#detcord .collapsible.open .collapsible-header svg {
	transform: rotate(90deg);
}

#detcord .collapsible-content {
	display: none;
	padding-bottom: 8px;
}

#detcord .collapsible.open .collapsible-content {
	display: block;
	animation: detcord-fade-in 0.2s ease-out;
}

@keyframes detcord-fade-in {
	from { opacity: 0; }
	to { opacity: 1; }
}
`;

// =============================================================================
// BUTTON STYLES
// =============================================================================

/**
 * Button variants: primary, secondary, danger
 */
const BUTTON_VARIANTS_CSS = `
/* Base button styles */
#detcord .btn {
	display: inline-flex;
	align-items: center;
	justify-content: center;
	gap: 8px;
	min-width: 96px;
	height: 40px;
	padding: 0 16px;
	border: none;
	border-radius: var(--detcord-border-radius, 8px);
	font-size: 14px;
	font-weight: 500;
	font-family: inherit;
	line-height: 1;
	text-decoration: none;
	cursor: pointer;
	user-select: none;
	outline: none;
	transition: background-color var(--detcord-transition-fast, 0.15s ease),
		transform var(--detcord-transition-fast, 0.15s ease),
		box-shadow var(--detcord-transition-fast, 0.15s ease);
}

#detcord .btn:disabled {
	opacity: 0.5;
	cursor: not-allowed;
	transform: none !important;
	box-shadow: none !important;
}

#detcord .btn:focus-visible {
	box-shadow: 0 0 0 3px rgba(88, 101, 242, 0.4);
}

#detcord .btn svg {
	width: 18px;
	height: 18px;
	fill: currentColor;
}

/* Primary button */
#detcord .btn-primary {
	background: var(--brand-experiment, #5865f2);
	color: white;
}

#detcord .btn-primary:hover:not(:disabled) {
	background: var(--brand-experiment-560, #4752c4);
	transform: translateY(-1px);
	box-shadow: 0 4px 12px rgba(88, 101, 242, 0.35);
}

#detcord .btn-primary:active:not(:disabled) {
	background: var(--brand-experiment-600, #3c45a5);
	transform: translateY(0);
	box-shadow: none;
}

/* Secondary button */
#detcord .btn-secondary {
	background: var(--background-secondary, #2b2d31);
	color: var(--text-normal, #dbdee1);
}

#detcord .btn-secondary:hover:not(:disabled) {
	background: var(--background-modifier-hover, #3c3f45);
	transform: translateY(-1px);
}

#detcord .btn-secondary:active:not(:disabled) {
	background: var(--background-modifier-active, #43464d);
	transform: translateY(0);
}

/* Danger button */
#detcord .btn-danger {
	background: var(--status-danger, #ed4245);
	color: white;
}

#detcord .btn-danger:hover:not(:disabled) {
	background: #d93235;
	transform: translateY(-1px);
	box-shadow: 0 4px 12px rgba(237, 66, 69, 0.35);
}

#detcord .btn-danger:active:not(:disabled) {
	background: #c72c2f;
	transform: translateY(0);
	box-shadow: none;
}

/* Ghost button (text-only) */
#detcord .btn-ghost {
	background: transparent;
	color: var(--text-muted, #949ba4);
}

#detcord .btn-ghost:hover:not(:disabled) {
	color: var(--text-normal, #dbdee1);
	background: var(--background-modifier-hover, #3c3f45);
}

/* Link-style button */
#detcord .btn-link {
	min-width: auto;
	height: auto;
	padding: 0;
	background: transparent;
	color: var(--text-link, #00a8fc);
}

#detcord .btn-link:hover:not(:disabled) {
	text-decoration: underline;
}

/* Button sizes */
#detcord .btn-sm {
	min-width: 72px;
	height: 32px;
	padding: 0 12px;
	font-size: 13px;
}

#detcord .btn-lg {
	min-width: 120px;
	height: 48px;
	padding: 0 24px;
	font-size: 16px;
}

/* Full-width button */
#detcord .btn-full {
	width: 100%;
}

/* Button group */
#detcord .btn-group {
	display: flex;
	gap: 12px;
}

/* Navigation footer */
#detcord .nav-footer {
	display: flex;
	justify-content: space-between;
	align-items: center;
	padding: 12px 16px;
	background: var(--background-secondary, #2b2d31);
	border-top: 1px solid var(--background-modifier-accent, #4e5058);
}

#detcord .nav-footer .btn-group {
	margin-left: auto;
}
`;

// =============================================================================
// PROGRESS RING STYLES
// =============================================================================

/**
 * SVG-based circular progress indicator
 */
const PROGRESS_RING_CSS = `
/* Progress ring container */
#detcord .progress-container {
	display: flex;
	flex-direction: column;
	align-items: center;
	padding: 16px 0;
}

#detcord .progress-ring {
	position: relative;
	width: var(--detcord-progress-size, 120px);
	height: var(--detcord-progress-size, 120px);
}

#detcord .progress-ring svg {
	width: 100%;
	height: 100%;
	transform: rotate(-90deg);
}

#detcord .progress-ring .bg {
	fill: none;
	stroke: var(--background-modifier-accent, #4e5058);
	stroke-width: var(--detcord-progress-stroke-width, 8);
}

#detcord .progress-ring .fg {
	fill: none;
	stroke: var(--brand-experiment, #5865f2);
	stroke-width: var(--detcord-progress-stroke-width, 8);
	stroke-linecap: round;
	stroke-dasharray: 339.292;
	stroke-dashoffset: 339.292;
	transition: stroke-dashoffset var(--detcord-transition-slow, 0.35s ease);
}

#detcord .progress-ring.danger .fg {
	stroke: var(--status-danger, #ed4245);
}

#detcord .progress-ring.success .fg {
	stroke: var(--status-positive, #23a55a);
}

/* Progress text inside ring */
#detcord .progress-text {
	position: absolute;
	top: 50%;
	left: 50%;
	transform: translate(-50%, -50%);
	text-align: center;
}

#detcord .progress-percent {
	font-size: 28px;
	font-weight: 600;
	color: var(--header-primary, #f2f3f5);
	line-height: 1;
}

#detcord .progress-label {
	margin-top: 4px;
	font-size: 11px;
	font-weight: 500;
	color: var(--text-muted, #949ba4);
	text-transform: uppercase;
	letter-spacing: 0.05em;
}

/* Progress stats below ring */
#detcord .progress-stats {
	display: flex;
	justify-content: center;
	gap: 20px;
	margin-top: 12px;
	padding: 10px 16px;
	background: var(--background-secondary, #2b2d31);
	border-radius: var(--detcord-border-radius, 6px);
}

#detcord .progress-stat {
	text-align: center;
}

#detcord .progress-stat-value {
	font-size: 20px;
	font-weight: 600;
	color: var(--header-primary, #f2f3f5);
	line-height: 1.2;
}

#detcord .progress-stat-value.success {
	color: var(--status-positive, #23a55a);
}

#detcord .progress-stat-value.danger {
	color: var(--status-danger, #ed4245);
}

#detcord .progress-stat-value.warning {
	color: var(--status-warning, #f0b232);
}

#detcord .progress-stat-label {
	margin-top: 4px;
	font-size: 11px;
	font-weight: 500;
	color: var(--text-muted, #949ba4);
	text-transform: uppercase;
	letter-spacing: 0.05em;
}

/* ETA display */
#detcord .progress-eta {
	margin-top: 16px;
	text-align: center;
	font-size: 14px;
	color: var(--text-muted, #949ba4);
}

#detcord .progress-eta strong {
	color: var(--text-normal, #dbdee1);
}
`;

// =============================================================================
// LIVE FEED STYLES
// =============================================================================

/**
 * Scrollable log/feed area for deletion progress
 */
const LIVE_FEED_CSS = `
/* Live feed container - no inner scroll, let content area handle scrolling */
#detcord .live-feed {
	margin: 12px 0;
	padding: 8px;
	background: var(--background-secondary, #2b2d31);
	border-radius: var(--detcord-border-radius, 6px);
	font-size: 12px;
	line-height: 1.3;
}

/* Feed header */
#detcord .feed-header {
	display: flex;
	align-items: center;
	justify-content: space-between;
	margin-bottom: 12px;
}

#detcord .feed-title {
	font-size: 12px;
	font-weight: 600;
	color: var(--header-secondary, #b5bac1);
	text-transform: uppercase;
	letter-spacing: 0.02em;
}

#detcord .feed-count {
	font-size: 12px;
	color: var(--text-muted, #949ba4);
}

/* Individual feed items */
#detcord .feed-item {
	display: flex;
	align-items: flex-start;
	gap: 6px;
	padding: 4px 6px;
	margin-bottom: 2px;
	background: var(--background-tertiary, #232428);
	border-radius: var(--detcord-border-radius-sm, 4px);
	animation: detcord-feed-enter 0.2s ease-out;
}

@keyframes detcord-feed-enter {
	from {
		opacity: 0;
		transform: translateY(-8px);
	}
	to {
		opacity: 1;
		transform: translateY(0);
	}
}

#detcord .feed-item:last-child {
	margin-bottom: 0;
}

#detcord .feed-item-icon {
	flex-shrink: 0;
	width: 16px;
	height: 16px;
	margin-top: 2px;
}

#detcord .feed-item-icon.success {
	fill: var(--status-positive, #23a55a);
}

#detcord .feed-item-icon.error {
	fill: var(--status-danger, #ed4245);
}

#detcord .feed-item-icon.warning {
	fill: var(--status-warning, #f0b232);
}

#detcord .feed-item-icon.info {
	fill: var(--text-muted, #949ba4);
}

#detcord .feed-item-content {
	flex: 1;
	min-width: 0;
}

#detcord .feed-item-author {
	font-weight: 500;
	color: var(--text-normal, #dbdee1);
}

#detcord .feed-item-message {
	color: var(--text-muted, #949ba4);
	white-space: nowrap;
	overflow: hidden;
	text-overflow: ellipsis;
}

#detcord .feed-item-time {
	flex-shrink: 0;
	font-size: 11px;
	color: var(--text-muted, #949ba4);
}

/* Empty state */
#detcord .feed-empty {
	padding: 24px;
	text-align: center;
	color: var(--text-muted, #949ba4);
	font-size: 14px;
}

/* Log levels */
#detcord .log {
	margin-bottom: 4px;
	color: var(--text-normal, #dbdee1);
}

#detcord .log-debug {
	color: var(--text-muted, #949ba4);
}

#detcord .log-info {
	color: var(--text-normal, #dbdee1);
}

#detcord .log-success {
	color: var(--status-positive, #23a55a);
}

#detcord .log-warning {
	color: var(--status-warning, #f0b232);
}

#detcord .log-error {
	color: var(--status-danger, #ed4245);
}

#detcord .log-time {
	margin-right: 8px;
	color: var(--text-muted, #949ba4);
	font-family: 'Consolas', 'Monaco', monospace;
	font-size: 12px;
}
`;

// =============================================================================
// CELEBRATION/COMPLETION SCREEN
// =============================================================================

/**
 * Countdown animation styles for pre-deletion sequence
 */
const COUNTDOWN_CSS = `
/* Countdown overlay */
#detcord .countdown-overlay {
	position: absolute;
	top: 0;
	left: 0;
	right: 0;
	bottom: 0;
	display: flex;
	flex-direction: column;
	align-items: center;
	justify-content: center;
	background: var(--background-primary, #313338);
	z-index: 100;
}

#detcord .countdown-number {
	font-size: 120px;
	font-weight: 700;
	color: var(--header-primary, #f2f3f5);
	line-height: 1;
	animation: detcord-countdown-pulse 0.9s ease-out;
}

#detcord .countdown-boom {
	font-size: 48px;
	font-weight: 700;
	color: var(--status-danger, #ed4245);
	animation: detcord-countdown-pulse 0.5s ease-out;
}

@keyframes detcord-countdown-pulse {
	0% {
		transform: scale(1);
		opacity: 1;
	}
	50% {
		transform: scale(1.2);
	}
	100% {
		transform: scale(0.8);
		opacity: 0;
	}
}

@keyframes detcord-screen-shake {
	0%, 100% {
		transform: translateX(0);
	}
	10%, 30%, 50%, 70%, 90% {
		transform: translateX(-3px);
	}
	20%, 40%, 60%, 80% {
		transform: translateX(3px);
	}
}

@keyframes detcord-flash {
	0% {
		background: rgba(255, 255, 255, 0.5);
	}
	100% {
		background: transparent;
	}
}

#detcord.shaking {
	animation: detcord-screen-shake 0.4s ease-in-out;
}

#detcord .flash-overlay {
	position: absolute;
	top: 0;
	left: 0;
	right: 0;
	bottom: 0;
	pointer-events: none;
	animation: detcord-flash 0.3s ease-out forwards;
	z-index: 101;
}

/* Rotating status message */
#detcord .status-message {
	margin-top: 16px;
	font-size: 14px;
	color: var(--text-muted, #949ba4);
	text-align: center;
	min-height: 1.4em;
}

#detcord .status-message.rotating {
	animation: detcord-status-fade 0.3s ease-in-out;
}

@keyframes detcord-status-fade {
	0% {
		opacity: 0;
		transform: translateY(-5px);
	}
	100% {
		opacity: 1;
		transform: translateY(0);
	}
}
`;

/**
 * Confetti animation styles
 */
const CONFETTI_CSS = `
/* Confetti container */
#detcord .confetti-container {
	position: absolute;
	top: 0;
	left: 0;
	width: 100%;
	height: 100%;
	pointer-events: none;
	overflow: hidden;
	z-index: 1001;
}

#detcord .confetti {
	position: absolute;
	width: 10px;
	height: 10px;
	top: -10px;
	left: var(--x, 50%);
	opacity: 0.9;
	animation: detcord-confetti-fall 3s ease-out var(--delay, 0s) forwards;
}

#detcord .confetti:nth-child(odd) {
	border-radius: 50%;
}

#detcord .confetti:nth-child(even) {
	transform: rotate(45deg);
}

@keyframes detcord-confetti-fall {
	0% {
		transform: translateY(0) rotate(0deg);
		opacity: 1;
	}
	25% {
		transform: translateY(100px) rotate(180deg) translateX(20px);
	}
	50% {
		transform: translateY(200px) rotate(360deg) translateX(-10px);
	}
	75% {
		transform: translateY(300px) rotate(540deg) translateX(15px);
	}
	100% {
		transform: translateY(500px) rotate(720deg) translateX(-5px);
		opacity: 0;
	}
}
`;

/**
 * Completion screen with celebration animation
 */
const CELEBRATION_CSS = `
/* Celebration container */
#detcord .celebration {
	display: flex;
	flex-direction: column;
	align-items: center;
	padding: 32px 24px;
	text-align: center;
}

#detcord .celebration-icon {
	width: 80px;
	height: 80px;
	margin-bottom: 24px;
	fill: var(--status-positive, #23a55a);
	animation: detcord-celebration-pop 0.4s ease-out;
}

@keyframes detcord-celebration-pop {
	0% {
		opacity: 0;
		transform: scale(0.3);
	}
	50% {
		transform: scale(1.1);
	}
	100% {
		opacity: 1;
		transform: scale(1);
	}
}

#detcord .celebration-title {
	margin: 0 0 8px;
	font-size: 24px;
	font-weight: 600;
	color: var(--header-primary, #f2f3f5);
}

#detcord .celebration-subtitle {
	margin: 0 0 24px;
	font-size: 16px;
	color: var(--text-muted, #949ba4);
}

/* Summary card */
#detcord .summary-card {
	width: 100%;
	padding: 20px;
	background: var(--background-secondary, #2b2d31);
	border-radius: var(--detcord-border-radius, 8px);
	margin-bottom: 24px;
}

#detcord .summary-row {
	display: flex;
	justify-content: space-between;
	padding: 8px 0;
	border-bottom: 1px solid var(--background-modifier-accent, #4e5058);
}

#detcord .summary-row:last-child {
	border-bottom: none;
}

#detcord .summary-label {
	font-size: 14px;
	color: var(--text-muted, #949ba4);
}

#detcord .summary-value {
	font-size: 14px;
	font-weight: 600;
	color: var(--text-normal, #dbdee1);
}

#detcord .summary-value.success {
	color: var(--status-positive, #23a55a);
}

#detcord .summary-value.danger {
	color: var(--status-danger, #ed4245);
}

/* Confetti animation (optional, lightweight) */
#detcord .confetti {
	position: fixed;
	top: 0;
	left: 0;
	width: 100%;
	height: 100%;
	pointer-events: none;
	z-index: 1001;
	overflow: hidden;
}

#detcord .confetti-piece {
	position: absolute;
	width: 10px;
	height: 10px;
	background: var(--brand-experiment, #5865f2);
	opacity: 0.8;
	animation: detcord-confetti-fall 3s ease-out forwards;
}

@keyframes detcord-confetti-fall {
	0% {
		transform: translateY(-100vh) rotate(0deg);
		opacity: 1;
	}
	100% {
		transform: translateY(100vh) rotate(720deg);
		opacity: 0;
	}
}
`;

// =============================================================================
// UTILITY STYLES
// =============================================================================

/**
 * Utility classes and helper styles
 */
const UTILITY_CSS = `
/* Visibility utilities */
#detcord .hidden {
	display: none !important;
}

#detcord .invisible {
	visibility: hidden;
}

/* Text utilities */
#detcord .text-center {
	text-align: center;
}

#detcord .text-muted {
	color: var(--text-muted, #949ba4);
}

#detcord .text-danger {
	color: var(--status-danger, #ed4245);
}

#detcord .text-success {
	color: var(--status-positive, #23a55a);
}

#detcord .text-warning {
	color: var(--status-warning, #f0b232);
}

#detcord .text-small {
	font-size: 12px;
}

#detcord .text-truncate {
	white-space: nowrap;
	overflow: hidden;
	text-overflow: ellipsis;
}

/* Spacing utilities */
#detcord .mt-0 { margin-top: 0; }
#detcord .mt-8 { margin-top: 8px; }
#detcord .mt-16 { margin-top: 16px; }
#detcord .mt-24 { margin-top: 24px; }

#detcord .mb-0 { margin-bottom: 0; }
#detcord .mb-8 { margin-bottom: 8px; }
#detcord .mb-16 { margin-bottom: 16px; }
#detcord .mb-24 { margin-bottom: 24px; }

/* Flex utilities */
#detcord .flex {
	display: flex;
}

#detcord .flex-center {
	display: flex;
	align-items: center;
	justify-content: center;
}

#detcord .flex-between {
	display: flex;
	align-items: center;
	justify-content: space-between;
}

#detcord .flex-1 {
	flex: 1;
}

#detcord .gap-8 {
	gap: 8px;
}

#detcord .gap-16 {
	gap: 16px;
}

/* Divider */
#detcord .divider {
	height: 1px;
	margin: 16px 0;
	background: var(--background-modifier-accent, #4e5058);
}

/* Loading spinner */
#detcord .spinner {
	display: inline-block;
	width: 20px;
	height: 20px;
	border: 2px solid var(--background-modifier-accent, #4e5058);
	border-top-color: var(--brand-experiment, #5865f2);
	border-radius: 50%;
	animation: detcord-spin 0.8s linear infinite;
}

#detcord .spinner-sm {
	width: 14px;
	height: 14px;
	border-width: 1.5px;
}

#detcord .spinner-lg {
	width: 32px;
	height: 32px;
	border-width: 3px;
}

@keyframes detcord-spin {
	to {
		transform: rotate(360deg);
	}
}

/* Tooltip (basic) */
#detcord [data-tooltip] {
	position: relative;
}

#detcord [data-tooltip]::before {
	content: attr(data-tooltip);
	position: absolute;
	bottom: 100%;
	left: 50%;
	transform: translateX(-50%) translateY(-4px);
	padding: 8px 12px;
	background: var(--background-floating, #111214);
	border-radius: 4px;
	color: var(--text-normal, #dbdee1);
	font-size: 12px;
	font-weight: 500;
	white-space: nowrap;
	opacity: 0;
	pointer-events: none;
	transition: opacity var(--detcord-transition-fast, 0.15s ease),
		transform var(--detcord-transition-fast, 0.15s ease);
	z-index: 1002;
}

#detcord [data-tooltip]:hover::before {
	opacity: 1;
	transform: translateX(-50%) translateY(-8px);
}

/* Focus visible for accessibility */
#detcord :focus-visible {
	outline: 2px solid var(--brand-experiment, #5865f2);
	outline-offset: 2px;
}

#detcord button:focus:not(:focus-visible) {
	outline: none;
}

/* Reduced motion support */
@media (prefers-reduced-motion: reduce) {
	#detcord,
	#detcord *,
	#detcord *::before,
	#detcord *::after {
		animation-duration: 0.01ms !important;
		animation-iteration-count: 1 !important;
		transition-duration: 0.01ms !important;
	}
}
`;

// =============================================================================
// PREVIEW/CONFIRMATION SCREEN
// =============================================================================

/**
 * Preview screen before deletion starts
 */
const PREVIEW_CSS = `
/* Preview summary */
#detcord .preview-summary {
	padding: 20px;
	background: var(--background-secondary, #2b2d31);
	border-radius: var(--detcord-border-radius, 8px);
	margin-bottom: 20px;
	text-align: center;
}

#detcord .preview-count {
	font-size: 48px;
	font-weight: 700;
	color: var(--header-primary, #f2f3f5);
	line-height: 1;
}

#detcord .preview-count-label {
	margin-top: 8px;
	font-size: 14px;
	color: var(--text-muted, #949ba4);
}

#detcord .preview-estimate {
	margin-top: 16px;
	padding-top: 16px;
	border-top: 1px solid var(--background-modifier-accent, #4e5058);
	font-size: 14px;
	color: var(--text-muted, #949ba4);
}

#detcord .preview-estimate strong {
	color: var(--text-normal, #dbdee1);
}

/* Preview messages list - no inner scroll, content area handles scrolling */
#detcord .preview-messages {
	margin-bottom: 12px;
	padding: 8px;
	background: var(--background-secondary, #2b2d31);
	border-radius: var(--detcord-border-radius, 6px);
}

#detcord .preview-message {
	display: flex;
	align-items: flex-start;
	gap: 8px;
	padding: 6px;
	margin-bottom: 2px;
	background: var(--background-tertiary, #232428);
	border-radius: var(--detcord-border-radius-sm, 4px);
}

#detcord .preview-message:last-child {
	margin-bottom: 0;
}

#detcord .preview-avatar {
	width: 32px;
	height: 32px;
	background: var(--background-modifier-accent, #4e5058);
	border-radius: 50%;
	flex-shrink: 0;
}

#detcord .preview-meta {
	flex: 1;
	min-width: 0;
}

#detcord .preview-author {
	font-weight: 500;
	color: var(--text-normal, #dbdee1);
}

#detcord .preview-timestamp {
	margin-left: 8px;
	font-size: 11px;
	color: var(--text-muted, #949ba4);
}

#detcord .preview-content {
	margin-top: 4px;
	color: var(--text-normal, #dbdee1);
	font-size: 14px;
	line-height: 1.4;
	white-space: nowrap;
	overflow: hidden;
	text-overflow: ellipsis;
}

/* Warning banner */
#detcord .warning-banner {
	display: flex;
	align-items: flex-start;
	gap: 12px;
	padding: 12px 16px;
	margin-bottom: 16px;
	background: rgba(240, 178, 50, 0.1);
	border: 1px solid rgba(240, 178, 50, 0.3);
	border-radius: var(--detcord-border-radius, 8px);
}

#detcord .warning-banner svg {
	flex-shrink: 0;
	width: 20px;
	height: 20px;
	fill: var(--status-warning, #f0b232);
}

#detcord .warning-banner-text {
	font-size: 14px;
	color: var(--text-normal, #dbdee1);
	line-height: 1.4;
}
`;

// =============================================================================
// TOKEN INPUT SCREEN
// =============================================================================

/**
 * Token entry screen styles
 */
const TOKEN_CSS = `
/* Token detected badge */
#detcord .token-badge {
	display: inline-flex;
	align-items: center;
	gap: 6px;
	padding: 4px 10px;
	background: rgba(35, 165, 90, 0.15);
	border-radius: var(--detcord-border-radius, 6px);
	color: var(--status-positive, #23a55a);
	font-size: 13px;
	font-weight: 500;
}

#detcord .token-badge svg {
	width: 16px;
	height: 16px;
	fill: currentColor;
}

/* Token masked display */
#detcord .token-masked {
	padding: 10px 12px;
	background: var(--input-background, #1e1f22);
	border-radius: var(--detcord-border-radius, 8px);
	font-family: 'Consolas', 'Monaco', monospace;
	font-size: 13px;
	color: var(--text-muted, #949ba4);
	letter-spacing: 1px;
}

/* Manual token input toggle */
#detcord .token-toggle {
	display: flex;
	align-items: center;
	gap: 8px;
	margin-top: 16px;
	padding: 12px 16px;
	background: var(--background-secondary-alt, #232428);
	border-radius: var(--detcord-border-radius, 8px);
	cursor: pointer;
}

#detcord .token-toggle:hover {
	background: var(--background-modifier-hover, #3c3f45);
}

#detcord .token-toggle svg {
	width: 18px;
	height: 18px;
	fill: var(--text-muted, #949ba4);
	transition: transform var(--detcord-transition-fast, 0.15s ease);
}

#detcord .token-toggle.open svg {
	transform: rotate(180deg);
}

#detcord .token-toggle span {
	font-size: 14px;
	color: var(--text-muted, #949ba4);
}
`;

// =============================================================================
// COMBINED THEME EXPORT
// =============================================================================

/**
 * Complete theme CSS combining all components
 * This is the main export for injecting styles
 */
export const THEME_CSS = `
${CSS_VARIABLES}
${BUTTON_CSS}
${WINDOW_CSS}
${SCREEN_CSS}
${OPTION_CARD_CSS}
${FORM_CSS}
${BUTTON_VARIANTS_CSS}
${PROGRESS_RING_CSS}
${LIVE_FEED_CSS}
${COUNTDOWN_CSS}
${CONFETTI_CSS}
${CELEBRATION_CSS}
${PREVIEW_CSS}
${TOKEN_CSS}
${UTILITY_CSS}
`.trim();

/**
 * Single combined export for convenience
 * Contains all Detcord styles
 */
export const DETCORD_CSS = THEME_CSS;

/**
 * Injects Detcord styles into the document head
 * Uses a unique ID to prevent duplicate injection
 */
export function injectStyles(): HTMLStyleElement {
  const existingStyle = document.getElementById('detcord-styles');
  if (existingStyle) {
    return existingStyle as HTMLStyleElement;
  }

  const style = document.createElement('style');
  style.id = 'detcord-styles';
  style.textContent = DETCORD_CSS;
  document.head.appendChild(style);
  return style;
}

/**
 * Removes Detcord styles from the document
 */
export function removeStyles(): void {
  const style = document.getElementById('detcord-styles');
  if (style) {
    style.remove();
  }
}

/**
 * Updates the progress ring stroke-dashoffset based on percentage
 * The circumference of the ring is 2 * PI * radius = 2 * 3.14159 * 54 = 339.292
 *
 * @param percent - Progress percentage (0-100)
 * @returns The stroke-dashoffset value
 */
export function getProgressOffset(percent: number): number {
  const circumference = 339.292;
  const clampedPercent = Math.max(0, Math.min(100, percent));
  return circumference - (clampedPercent / 100) * circumference;
}
