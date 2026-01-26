/**
 * Detcord UI Controller
 *
 * High-performance UI controller that orchestrates the Detcord interface,
 * connecting UI elements to the DeletionEngine. Optimized for running
 * inside Discord's resource-intensive web application.
 *
 * Performance optimizations:
 * - Batched DOM updates via requestAnimationFrame
 * - Event delegation (single listener on container)
 * - Throttled progress and live feed updates
 * - Bounded arrays to prevent memory leaks
 * - DocumentFragment for batch insertions
 * - Cleanup manager for all event listeners
 */

import type {
  DeletionEngineState,
  DeletionEngineStats,
  DiscordMessage,
} from '../core/deletion-engine';
import { DeletionEngine } from '../core/deletion-engine';
import { DiscordApiClient, type DiscordChannel } from '../core/discord-api';
import { getAuthorId, getChannelIdFromUrl, getGuildIdFromUrl, getToken } from '../core/token';
import type { DeletionOrder } from '../core/types';
import { dateToSnowflake, escapeHtml, formatDuration } from '../utils/helpers';
import {
  createBoundedArray,
  createCleanupManager,
  type ThrottledFunction,
  throttle,
  trimChildren,
} from '../utils/performance';
import { createConfetti, createStatusRotator, runCountdownSequence } from './effects';
import type { PreviewMessage } from './templates';
import { createPreviewScreenContent } from './templates';

// =============================================================================
// Types and Interfaces
// =============================================================================

/**
 * Options for the DetcordUI controller
 */
export interface DetcordUIOptions {
  /** Callback when UI is shown */
  onShow?: () => void;
  /** Callback when UI is hidden */
  onHide?: () => void;
  /** Maximum entries in the live feed (default: 100) */
  maxFeedEntries?: number;
  /** Throttle interval for progress updates in ms (default: 100) */
  progressThrottleMs?: number;
  /** Throttle interval for feed updates in ms (default: 50) */
  feedThrottleMs?: number;
}

/**
 * Live feed entry for deleted messages
 */
interface FeedEntry {
  messageId: string;
  content: string;
  timestamp: Date;
  success: boolean;
}

/**
 * Screen IDs for navigation
 */
type ScreenId = 'setup' | 'preview' | 'running' | 'complete' | 'error';

/**
 * Wizard step IDs
 */
type WizardStep = 'location' | 'timerange' | 'filters' | 'review';

/**
 * Target scope for deletion
 */
type TargetScope = 'channel' | 'dm' | 'server' | 'manual';

/**
 * Configuration for deletion operation
 */
interface DeletionConfig {
  targetScope: TargetScope;
  guildId: string | undefined;
  channelId: string;
  /** Multiple selected channels (when using channel picker) */
  selectedChannelIds: string[];
  beforeDate: Date | undefined;
  afterDate: Date | undefined;
  contentFilter: string | undefined;
  hasLink: boolean;
  hasFile: boolean;
  includePinned: boolean;
  pattern: string | undefined;
  /** Order to delete messages: 'newest' (default) or 'oldest' first */
  deletionOrder: DeletionOrder;
}

// =============================================================================
// Constants
// =============================================================================

/** Maximum feed entries to prevent memory leaks */
const DEFAULT_MAX_FEED_ENTRIES = 100;

/** Throttle interval for progress updates (ms) */
const DEFAULT_PROGRESS_THROTTLE_MS = 100;

/** Throttle interval for feed updates (ms) */
const DEFAULT_FEED_THROTTLE_MS = 50;

/** Maximum characters for message preview */
const MAX_PREVIEW_LENGTH = 80;

// Progress ring SVG uses radius 52 with circumference 2 * PI * 52 ≈ 327

/** CSS class prefix for scoping styles */
const CSS_PREFIX = 'detcord';

/** Z-index for the floating window */
const WINDOW_Z_INDEX = 999999;

// =============================================================================
// Styles
// =============================================================================

const STYLES = `
/* ============================================
   DETCORD WIZARD UI - Clean Sweep Edition
   ============================================ */

/* Trigger Button */
.${CSS_PREFIX}-trigger {
	position: fixed;
	bottom: 20px;
	right: 20px;
	width: 52px;
	height: 52px;
	border-radius: 50%;
	background: linear-gradient(135deg, #5865f2 0%, #4752c4 100%);
	border: none;
	cursor: pointer;
	display: flex;
	align-items: center;
	justify-content: center;
	box-shadow: 0 4px 16px rgba(88, 101, 242, 0.4);
	transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
	z-index: ${WINDOW_Z_INDEX};
}

.${CSS_PREFIX}-trigger:hover {
	transform: scale(1.08);
	box-shadow: 0 6px 24px rgba(88, 101, 242, 0.5);
}

.${CSS_PREFIX}-trigger svg {
	width: 24px;
	height: 24px;
	fill: white;
}

/* Window */
.${CSS_PREFIX}-window {
	position: fixed;
	top: 50%;
	left: 50%;
	transform: translate(-50%, -50%);
	width: 420px;
	max-width: 95vw;
	max-height: 85vh;
	background: #1e1f22;
	border-radius: 12px;
	box-shadow: 0 16px 48px rgba(0, 0, 0, 0.6);
	z-index: ${WINDOW_Z_INDEX + 1};
	display: none;
	flex-direction: column;
	overflow: visible;
	font-family: 'gg sans', 'Noto Sans', 'Helvetica Neue', Helvetica, Arial, sans-serif;
	color: #dbdee1;
	font-size: 14px;
}

.${CSS_PREFIX}-window.visible {
	display: flex;
	animation: detcord-fade-in 0.2s ease-out;
}

@keyframes detcord-fade-in {
	from { opacity: 0; transform: translate(-50%, -48%); }
	to { opacity: 1; transform: translate(-50%, -50%); }
}

/* Backdrop */
.${CSS_PREFIX}-backdrop {
	position: fixed;
	top: 0;
	left: 0;
	right: 0;
	bottom: 0;
	background: rgba(0, 0, 0, 0.8);
	z-index: ${WINDOW_Z_INDEX};
	display: none;
	backdrop-filter: blur(2px);
}

.${CSS_PREFIX}-backdrop.visible {
	display: block;
	animation: detcord-backdrop-in 0.2s ease-out;
}

@keyframes detcord-backdrop-in {
	from { opacity: 0; }
	to { opacity: 1; }
}

/* Header */
.${CSS_PREFIX}-header {
	display: flex;
	align-items: center;
	justify-content: space-between;
	padding: 16px 20px;
	background: #2b2d31;
	border-bottom: 1px solid #1e1f22;
}

.${CSS_PREFIX}-header h2 {
	margin: 0;
	font-size: 16px;
	font-weight: 600;
	color: #f2f3f5;
}

.${CSS_PREFIX}-close {
	width: 28px;
	height: 28px;
	border: none;
	background: transparent;
	cursor: pointer;
	padding: 0;
	display: flex;
	align-items: center;
	justify-content: center;
	border-radius: 4px;
	transition: background 0.15s ease;
}

.${CSS_PREFIX}-close:hover {
	background: #383a40;
}

.${CSS_PREFIX}-close svg {
	width: 18px;
	height: 18px;
	fill: #b5bac1;
	transition: fill 0.15s ease;
}

.${CSS_PREFIX}-close:hover svg {
	fill: #f2f3f5;
}

/* Minimize Button */
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
	border-radius: 4px;
	transition: background 0.15s ease;
	margin-right: 4px;
}

.${CSS_PREFIX}-minimize:hover {
	background: #383a40;
}

.${CSS_PREFIX}-minimize svg {
	width: 18px;
	height: 18px;
	fill: #b5bac1;
	transition: fill 0.15s ease;
}

.${CSS_PREFIX}-minimize:hover svg {
	fill: #f2f3f5;
}

/* Header buttons container */
.${CSS_PREFIX}-header-buttons {
	display: flex;
	align-items: center;
}

/* Minimized Indicator */
.${CSS_PREFIX}-mini-indicator {
	position: fixed;
	bottom: 80px;
	right: 20px;
	width: 60px;
	height: 60px;
	border-radius: 50%;
	background: #2b2d31;
	border: 3px solid #5865f2;
	display: none;
	align-items: center;
	justify-content: center;
	cursor: pointer;
	z-index: ${WINDOW_Z_INDEX + 2};
	box-shadow: 0 4px 16px rgba(0, 0, 0, 0.4);
	transition: all 0.2s ease;
}

.${CSS_PREFIX}-mini-indicator.visible {
	display: flex;
	animation: detcord-fade-in 0.2s ease-out;
}

.${CSS_PREFIX}-mini-indicator:hover {
	transform: scale(1.08);
	box-shadow: 0 6px 24px rgba(88, 101, 242, 0.4);
}

.${CSS_PREFIX}-mini-progress {
	position: relative;
	width: 44px;
	height: 44px;
}

.${CSS_PREFIX}-mini-ring {
	width: 100px%;
	height: 100%;
	transform: rotate(-90deg);
}

.${CSS_PREFIX}-mini-ring-bg {
	fill: none;
	stroke: #3f4147;
	stroke-width: 4;
}

.${CSS_PREFIX}-mini-ring-fill {
	fill: none;
	stroke: #5865f2;
	stroke-width: 4;
	stroke-linecap: round;
	stroke-dasharray: 126;
	stroke-dashoffset: 126;
	transition: stroke-dashoffset 0.3s ease;
}

.${CSS_PREFIX}-mini-percent {
	position: absolute;
	top: 50%;
	left: 50%;
	transform: translate(-50%, -50%);
	font-size: 12px;
	font-weight: 700;
	color: #f2f3f5;
}

/* Step Indicator */
.${CSS_PREFIX}-steps {
	display: flex;
	justify-content: center;
	gap: 8px;
	padding: 16px 20px 0;
}

.${CSS_PREFIX}-step-dot {
	width: 8px;
	height: 8px;
	border-radius: 50%;
	background: #3f4147;
	transition: all 0.3s ease;
}

.${CSS_PREFIX}-step-dot.active {
	background: #5865f2;
	box-shadow: 0 0 8px rgba(88, 101, 242, 0.5);
}

.${CSS_PREFIX}-step-dot.completed {
	background: #23a559;
}

/* Content */
.${CSS_PREFIX}-content {
	flex: 1;
	overflow-y: auto;
	overflow-x: hidden;
	padding: 20px;
	max-height: calc(85vh - 120px);
}

/* Screens */
.${CSS_PREFIX}-screen {
	display: none;
}

.${CSS_PREFIX}-screen.active {
	display: block;
	animation: detcord-step-in 0.25s ease-out;
}

@keyframes detcord-step-in {
	from { opacity: 0; transform: translateX(10px); }
	to { opacity: 1; transform: translateX(0); }
}

/* Step Title */
.${CSS_PREFIX}-step-title {
	font-size: 20px;
	font-weight: 600;
	color: #f2f3f5;
	margin: 0 0 20px 0;
	text-align: center;
}

/* Location Cards */
.${CSS_PREFIX}-cards {
	display: grid;
	grid-template-columns: repeat(2, 1fr);
	gap: 12px;
	margin-bottom: 16px;
}

.${CSS_PREFIX}-card {
	background: #2b2d31;
	border: 2px solid transparent;
	border-radius: 8px;
	padding: 20px 16px;
	cursor: pointer;
	text-align: center;
	transition: all 0.2s ease;
}

.${CSS_PREFIX}-card:hover {
	background: #32353b;
	border-color: #3f4147;
}

.${CSS_PREFIX}-card.selected {
	background: rgba(88, 101, 242, 0.15);
	border-color: #5865f2;
}

.${CSS_PREFIX}-card.full-width {
	grid-column: 1 / -1;
}

.${CSS_PREFIX}-card-icon {
	font-size: 32px;
	margin-bottom: 8px;
}

.${CSS_PREFIX}-card-title {
	font-size: 14px;
	font-weight: 600;
	color: #f2f3f5;
	margin-bottom: 4px;
}

.${CSS_PREFIX}-card-desc {
	font-size: 12px;
	color: #b5bac1;
}

/* Manual Channel Input */
.${CSS_PREFIX}-manual-input {
	margin-top: 12px;
	display: none;
}

.${CSS_PREFIX}-manual-input.visible {
	display: block;
	animation: detcord-step-in 0.2s ease-out;
}

.${CSS_PREFIX}-manual-input input {
	width: 100%;
	padding: 12px;
	background: #1e1f22;
	border: 1px solid #3f4147;
	border-radius: 8px;
	color: #f2f3f5;
	font-size: 14px;
	box-sizing: border-box;
	transition: border-color 0.15s ease;
}

.${CSS_PREFIX}-manual-input input:focus {
	outline: none;
	border-color: #5865f2;
}

.${CSS_PREFIX}-manual-input input::placeholder {
	color: #6d6f78;
}

/* Time Range Options */
.${CSS_PREFIX}-options {
	display: flex;
	flex-direction: column;
	gap: 8px;
}

.${CSS_PREFIX}-option {
	display: flex;
	align-items: center;
	gap: 12px;
	padding: 14px 16px;
	background: #2b2d31;
	border: 2px solid transparent;
	border-radius: 8px;
	cursor: pointer;
	transition: all 0.2s ease;
}

.${CSS_PREFIX}-option:hover {
	background: #32353b;
}

.${CSS_PREFIX}-option.selected {
	background: rgba(88, 101, 242, 0.15);
	border-color: #5865f2;
}

.${CSS_PREFIX}-option-radio {
	width: 18px;
	height: 18px;
	border: 2px solid #6d6f78;
	border-radius: 50%;
	display: flex;
	align-items: center;
	justify-content: center;
	flex-shrink: 0;
	transition: all 0.2s ease;
}

.${CSS_PREFIX}-option.selected .${CSS_PREFIX}-option-radio {
	border-color: #5865f2;
}

.${CSS_PREFIX}-option.selected .${CSS_PREFIX}-option-radio::after {
	content: '';
	width: 8px;
	height: 8px;
	background: #5865f2;
	border-radius: 50%;
}

.${CSS_PREFIX}-option-label {
	flex: 1;
	font-size: 14px;
	color: #f2f3f5;
}

.${CSS_PREFIX}-option-hint {
	font-size: 12px;
	color: #6d6f78;
}

/* Custom Date Range */
.${CSS_PREFIX}-date-range {
	display: none;
	gap: 12px;
	margin-top: 12px;
}

.${CSS_PREFIX}-date-range.visible {
	display: flex;
	animation: detcord-step-in 0.2s ease-out;
}

.${CSS_PREFIX}-date-range input {
	flex: 1;
	padding: 10px 12px;
	background: #1e1f22;
	border: 1px solid #3f4147;
	border-radius: 8px;
	color: #f2f3f5;
	font-size: 14px;
	box-sizing: border-box;
}

.${CSS_PREFIX}-date-range input:focus {
	outline: none;
	border-color: #5865f2;
}

/* Toggle Switches */
.${CSS_PREFIX}-toggles {
	display: flex;
	flex-direction: column;
	gap: 4px;
}

.${CSS_PREFIX}-toggle {
	display: flex;
	align-items: center;
	justify-content: space-between;
	padding: 12px 0;
	border-bottom: 1px solid #2b2d31;
}

.${CSS_PREFIX}-toggle:last-child {
	border-bottom: none;
}

.${CSS_PREFIX}-toggle-label {
	font-size: 14px;
	color: #f2f3f5;
}

.${CSS_PREFIX}-toggle-switch {
	width: 40px;
	height: 24px;
	background: #3f4147;
	border-radius: 12px;
	cursor: pointer;
	position: relative;
	transition: background 0.2s ease;
}

.${CSS_PREFIX}-toggle-switch.on {
	background: #23a559;
}

.${CSS_PREFIX}-toggle-switch::after {
	content: '';
	position: absolute;
	width: 18px;
	height: 18px;
	background: #fff;
	border-radius: 50%;
	top: 3px;
	left: 3px;
	transition: transform 0.2s ease;
}

.${CSS_PREFIX}-toggle-switch.on::after {
	transform: translateX(16px);
}

/* Deletion Order */
.${CSS_PREFIX}-deletion-order {
	margin-top: 16px;
	padding-top: 16px;
	border-top: 1px solid #2b2d31;
}

.${CSS_PREFIX}-deletion-order-label {
	display: block;
	font-size: 12px;
	font-weight: 600;
	color: #b5bac1;
	text-transform: uppercase;
	margin-bottom: 12px;
}

.${CSS_PREFIX}-radio-group {
	display: flex;
	gap: 24px;
}

.${CSS_PREFIX}-radio {
	display: flex;
	align-items: center;
	gap: 8px;
	cursor: pointer;
}

.${CSS_PREFIX}-radio input[type="radio"] {
	width: 18px;
	height: 18px;
	margin: 0;
	accent-color: #5865f2;
	cursor: pointer;
}

.${CSS_PREFIX}-radio-label {
	font-size: 14px;
	color: #f2f3f5;
}

/* Text Filter */
.${CSS_PREFIX}-filter-input {
	margin-top: 16px;
}

.${CSS_PREFIX}-filter-input label {
	display: block;
	font-size: 12px;
	font-weight: 600;
	color: #b5bac1;
	text-transform: uppercase;
	margin-bottom: 8px;
}

.${CSS_PREFIX}-filter-input input {
	width: 100%;
	padding: 12px;
	background: #1e1f22;
	border: 1px solid #3f4147;
	border-radius: 8px;
	color: #f2f3f5;
	font-size: 14px;
	box-sizing: border-box;
}

.${CSS_PREFIX}-filter-input input:focus {
	outline: none;
	border-color: #5865f2;
}

/* Review Summary */
.${CSS_PREFIX}-summary {
	background: #2b2d31;
	border-radius: 12px;
	padding: 24px;
	text-align: center;
	margin-bottom: 20px;
}

.${CSS_PREFIX}-summary-count {
	font-size: 48px;
	font-weight: 700;
	color: #f2f3f5;
	line-height: 1;
}

.${CSS_PREFIX}-summary-label {
	font-size: 14px;
	color: #b5bac1;
	margin-top: 4px;
}

.${CSS_PREFIX}-summary-details {
	font-size: 13px;
	color: #6d6f78;
	margin-top: 12px;
}

/* Preview Messages */
.${CSS_PREFIX}-preview-list {
	margin-top: 16px;
}

.${CSS_PREFIX}-preview-label {
	font-size: 12px;
	font-weight: 600;
	color: #b5bac1;
	text-transform: uppercase;
	margin-bottom: 8px;
}

.${CSS_PREFIX}-preview-messages {
	background: #1e1f22;
	border-radius: 8px;
	padding: 8px;
	max-height: 120px;
	overflow-y: auto;
}

.${CSS_PREFIX}-preview-msg {
	padding: 8px 10px;
	font-size: 13px;
	color: #b5bac1;
	border-radius: 4px;
	margin-bottom: 4px;
	white-space: nowrap;
	overflow: hidden;
	text-overflow: ellipsis;
}

.${CSS_PREFIX}-preview-msg:last-child {
	margin-bottom: 0;
}

/* Buttons */
.${CSS_PREFIX}-btn {
	display: inline-flex;
	align-items: center;
	justify-content: center;
	gap: 8px;
	padding: 12px 20px;
	border: none;
	border-radius: 8px;
	font-size: 14px;
	font-weight: 600;
	cursor: pointer;
	transition: all 0.15s ease;
}

.${CSS_PREFIX}-btn-primary {
	background: #5865f2;
	color: #fff;
}

.${CSS_PREFIX}-btn-primary:hover {
	background: #4752c4;
}

.${CSS_PREFIX}-btn-primary:disabled {
	background: #3f4147;
	color: #6d6f78;
	cursor: not-allowed;
}

.${CSS_PREFIX}-btn-sweep {
	background: linear-gradient(135deg, #5865f2 0%, #4752c4 100%);
	color: #fff;
	font-size: 15px;
	padding: 14px 24px;
}

.${CSS_PREFIX}-btn-sweep:hover {
	box-shadow: 0 4px 16px rgba(88, 101, 242, 0.4);
	transform: translateY(-1px);
}

.${CSS_PREFIX}-btn-secondary {
	background: #2b2d31;
	color: #f2f3f5;
}

.${CSS_PREFIX}-btn-secondary:hover {
	background: #383a40;
}

.${CSS_PREFIX}-btn-ghost {
	background: transparent;
	color: #b5bac1;
}

.${CSS_PREFIX}-btn-ghost:hover {
	color: #f2f3f5;
}

.${CSS_PREFIX}-btn-group {
	display: flex;
	gap: 12px;
	margin-top: 20px;
}

/* Progress Screen */
.${CSS_PREFIX}-progress-container {
	display: flex;
	flex-direction: column;
	align-items: center;
	padding: 20px 0;
}

.${CSS_PREFIX}-progress-ring-container {
	position: relative;
	width: 140px;
	height: 140px;
	margin-bottom: 16px;
}

.${CSS_PREFIX}-progress-ring {
	width: 100%;
	height: 100%;
	transform: rotate(-90deg);
}

.${CSS_PREFIX}-progress-ring-bg {
	fill: none;
	stroke: #3f4147;
	stroke-width: 8;
}

.${CSS_PREFIX}-progress-ring-fill {
	fill: none;
	stroke: url(#detcord-gradient);
	stroke-width: 8;
	stroke-linecap: round;
	stroke-dasharray: 377;
	stroke-dashoffset: 377;
	transition: stroke-dashoffset 0.5s ease;
	filter: drop-shadow(0 0 8px rgba(88, 101, 242, 0.5));
}

.${CSS_PREFIX}-progress-ring-text {
	position: absolute;
	top: 50%;
	left: 50%;
	transform: translate(-50%, -50%);
	text-align: center;
}

.${CSS_PREFIX}-progress-percent {
	font-size: 36px;
	font-weight: 700;
	color: #f2f3f5;
	line-height: 1;
}

.${CSS_PREFIX}-progress-count {
	font-size: 12px;
	color: #b5bac1;
	margin-top: 4px;
}

.${CSS_PREFIX}-progress-stats {
	display: grid;
	grid-template-columns: repeat(3, 1fr);
	gap: 12px;
	width: 100%;
	margin-top: 16px;
}

.${CSS_PREFIX}-stat {
	text-align: center;
	padding: 12px;
	background: #2b2d31;
	border-radius: 8px;
}

.${CSS_PREFIX}-stat-value {
	font-size: 20px;
	font-weight: 700;
	color: #f2f3f5;
}

.${CSS_PREFIX}-stat-value.success { color: #23a559; }
.${CSS_PREFIX}-stat-value.error { color: #f23f43; }
.${CSS_PREFIX}-stat-value.rate { color: #5865f2; }

.${CSS_PREFIX}-stat-label {
	font-size: 11px;
	color: #6d6f78;
	text-transform: uppercase;
	letter-spacing: 0.5px;
	margin-top: 2px;
}

.${CSS_PREFIX}-progress-bar-container {
	width: 100%;
	height: 6px;
	background: #3f4147;
	border-radius: 3px;
	overflow: hidden;
	margin-top: 16px;
	position: relative;
}

.${CSS_PREFIX}-progress-bar {
	height: 100%;
	background: linear-gradient(90deg, #5865f2 0%, #7289da 50%, #5865f2 100%);
	background-size: 200% 100%;
	border-radius: 3px;
	transition: width 0.3s ease;
	animation: detcord-progress-shimmer 2s linear infinite;
}

@keyframes detcord-progress-shimmer {
	0% { background-position: 200% 0; }
	100% { background-position: -200% 0; }
}

.${CSS_PREFIX}-progress-eta {
	font-size: 13px;
	color: #b5bac1;
	margin-top: 12px;
	display: flex;
	align-items: center;
	gap: 6px;
}

.${CSS_PREFIX}-progress-eta::before {
	content: '⏱';
}

.${CSS_PREFIX}-current-message {
	width: 100%;
	padding: 10px 12px;
	background: #1e1f22;
	border-radius: 8px;
	margin-top: 12px;
	font-size: 12px;
	color: #6d6f78;
	white-space: nowrap;
	overflow: hidden;
	text-overflow: ellipsis;
}

.${CSS_PREFIX}-current-message::before {
	content: '🗑️ ';
}

.${CSS_PREFIX}-current-message.${CSS_PREFIX}-status-searching::before {
	content: '🔍 ';
}

.${CSS_PREFIX}-current-message.${CSS_PREFIX}-status-searching {
	animation: ${CSS_PREFIX}-pulse 1.5s ease-in-out infinite;
}

@keyframes ${CSS_PREFIX}-pulse {
	0%, 100% { opacity: 0.7; }
	50% { opacity: 1; }
}

/* Status Speaker */
.${CSS_PREFIX}-status-speaker {
	display: flex;
	align-items: flex-start;
	gap: 12px;
	margin-bottom: 16px;
	padding: 0 4px;
}

.${CSS_PREFIX}-speaker-avatar {
	width: 40px;
	height: 40px;
	background: linear-gradient(135deg, #5865f2 0%, #7289da 100%);
	border-radius: 50%;
	display: flex;
	align-items: center;
	justify-content: center;
	font-size: 20px;
	flex-shrink: 0;
	box-shadow: 0 2px 8px rgba(88, 101, 242, 0.3);
}

.${CSS_PREFIX}-speaker-bubble {
	flex: 1;
	background: #2b2d31;
	border-radius: 12px;
	border-top-left-radius: 4px;
	padding: 12px 16px;
	position: relative;
}

.${CSS_PREFIX}-speaker-bubble::before {
	content: '';
	position: absolute;
	left: -8px;
	top: 12px;
	width: 0;
	height: 0;
	border-top: 6px solid transparent;
	border-bottom: 6px solid transparent;
	border-right: 8px solid #2b2d31;
}

.${CSS_PREFIX}-status-message {
	font-size: 14px;
	color: #dbdee1;
	font-style: italic;
	line-height: 1.4;
}

.${CSS_PREFIX}-status-message.rotating {
	animation: detcord-status-fade 0.4s ease-out;
}

@keyframes detcord-status-fade {
	0% { opacity: 0; transform: translateY(-4px); }
	100% { opacity: 1; transform: translateY(0); }
}

/* Time Stats */
.${CSS_PREFIX}-time-stats {
	display: flex;
	justify-content: center;
	gap: 20px;
	margin-top: 12px;
	padding: 8px 0;
	border-top: 1px solid #3f4147;
}

.${CSS_PREFIX}-time-stat {
	display: flex;
	gap: 4px;
	font-size: 12px;
}

.${CSS_PREFIX}-time-label {
	color: #6d6f78;
}

.${CSS_PREFIX}-time-value {
	color: #dbdee1;
	font-weight: 500;
}

/* Feed */
.${CSS_PREFIX}-feed {
	margin-top: 20px;
	max-height: 140px;
	overflow-y: auto;
	background: #1e1f22;
	border-radius: 8px;
	padding: 8px;
}

.${CSS_PREFIX}-feed-entry {
	padding: 6px 10px;
	font-size: 12px;
	border-radius: 4px;
	margin-bottom: 4px;
	font-family: 'Consolas', 'Monaco', monospace;
	white-space: nowrap;
	overflow: hidden;
	text-overflow: ellipsis;
}

.${CSS_PREFIX}-feed-entry.success {
	color: #23a559;
}

.${CSS_PREFIX}-feed-entry.error {
	color: #f23f43;
}

/* Complete Screen */
.${CSS_PREFIX}-complete {
	text-align: center;
	padding: 30px 0;
}

.${CSS_PREFIX}-complete-icon {
	font-size: 64px;
	margin-bottom: 16px;
}

.${CSS_PREFIX}-complete-title {
	font-size: 24px;
	font-weight: 700;
	color: #f2f3f5;
	margin: 0 0 8px 0;
}

.${CSS_PREFIX}-complete-stats {
	font-size: 15px;
	color: #b5bac1;
}

.${CSS_PREFIX}-complete-time {
	font-size: 13px;
	color: #6d6f78;
	margin-top: 4px;
}

.${CSS_PREFIX}-complete-throttle {
	font-size: 12px;
	color: #ed4245;
	margin-top: 8px;
	padding: 6px 12px;
	background: rgba(237, 66, 69, 0.1);
	border-radius: 4px;
}

/* Error Screen */
.${CSS_PREFIX}-error-message {
	padding: 16px;
	background: rgba(242, 63, 67, 0.1);
	border: 1px solid rgba(242, 63, 67, 0.3);
	border-radius: 8px;
	color: #f2f3f5;
	margin-bottom: 16px;
}

.${CSS_PREFIX}-form-group {
	margin-bottom: 16px;
}

.${CSS_PREFIX}-form-group label {
	display: block;
	font-size: 12px;
	font-weight: 600;
	color: #b5bac1;
	text-transform: uppercase;
	margin-bottom: 8px;
}

.${CSS_PREFIX}-form-group input {
	width: 100%;
	padding: 12px;
	background: #1e1f22;
	border: 1px solid #3f4147;
	border-radius: 8px;
	color: #f2f3f5;
	font-size: 14px;
	box-sizing: border-box;
}

/* Info box */
.${CSS_PREFIX}-info {
	padding: 12px 14px;
	background: rgba(88, 101, 242, 0.1);
	border-radius: 8px;
	font-size: 13px;
	color: #b5bac1;
	margin-bottom: 16px;
}

.${CSS_PREFIX}-info strong {
	color: #f2f3f5;
}

/* Confetti */
.${CSS_PREFIX}-confetti-container {
	position: absolute;
	top: 0;
	left: 0;
	width: 100%;
	height: 100%;
	pointer-events: none;
	overflow: hidden;
	z-index: 1001;
}

.${CSS_PREFIX}-confetti-container .confetti {
	position: absolute;
	width: 10px;
	height: 10px;
	top: -10px;
	left: var(--x, 50%);
	opacity: 0.9;
	animation: detcord-confetti-fall 3s ease-out var(--delay, 0s) forwards;
}

.${CSS_PREFIX}-confetti-container .confetti:nth-child(odd) {
	border-radius: 50%;
}

.${CSS_PREFIX}-confetti-container .confetti:nth-child(even) {
	transform: rotate(45deg);
}

@keyframes detcord-confetti-fall {
	0% { transform: translateY(0) rotate(0deg); opacity: 1; }
	100% { transform: translateY(400px) rotate(720deg); opacity: 0; }
}

/* Countdown - positioned within the window */
.${CSS_PREFIX}-countdown-overlay {
	position: absolute;
	top: 0;
	left: 0;
	right: 0;
	bottom: 0;
	display: flex;
	align-items: center;
	justify-content: center;
	background: #1e1f22;
	border-radius: 12px;
	z-index: 100;
}

.${CSS_PREFIX}-countdown-overlay .countdown-number {
	font-size: 80px;
	font-weight: 700;
	color: #f2f3f5;
	animation: detcord-countdown-pulse 0.9s ease-out;
}

.${CSS_PREFIX}-countdown-overlay .countdown-boom {
	font-size: 36px;
	font-weight: 700;
	color: #5865f2;
	animation: detcord-countdown-pulse 0.5s ease-out;
}

@keyframes detcord-countdown-pulse {
	0% { transform: scale(0.5); opacity: 0; }
	50% { transform: scale(1.1); opacity: 1; }
	100% { transform: scale(1); opacity: 0; }
}

/* Hide legacy elements */
.${CSS_PREFIX}-checkbox-group {
	display: none;
}

/* Channel Picker */
.${CSS_PREFIX}-channel-picker {
	margin-top: 12px;
	display: none;
}

.${CSS_PREFIX}-channel-picker.visible {
	display: block;
}

.${CSS_PREFIX}-channel-search {
	width: 100%;
	padding: 10px 12px;
	background: #1e1f22;
	border: 1px solid #3f4147;
	border-radius: 6px;
	color: #dbdee1;
	font-size: 14px;
	margin-bottom: 8px;
}

.${CSS_PREFIX}-channel-search:focus {
	outline: none;
	border-color: #5865f2;
}

.${CSS_PREFIX}-channel-search::placeholder {
	color: #6d6f78;
}

.${CSS_PREFIX}-channel-list {
	max-height: 200px;
	overflow-y: auto;
	background: #1e1f22;
	border: 1px solid #3f4147;
	border-radius: 6px;
}

.${CSS_PREFIX}-channel-item {
	display: flex;
	align-items: center;
	padding: 8px 12px;
	cursor: pointer;
	transition: background 0.1s ease;
	gap: 8px;
}

.${CSS_PREFIX}-channel-item:hover {
	background: #2b2d31;
}

.${CSS_PREFIX}-channel-item.selected {
	background: rgba(88, 101, 242, 0.15);
}

.${CSS_PREFIX}-channel-checkbox {
	width: 18px;
	height: 18px;
	border: 2px solid #6d6f78;
	border-radius: 4px;
	display: flex;
	align-items: center;
	justify-content: center;
	flex-shrink: 0;
	transition: all 0.15s ease;
}

.${CSS_PREFIX}-channel-item.selected .${CSS_PREFIX}-channel-checkbox {
	background: #5865f2;
	border-color: #5865f2;
}

.${CSS_PREFIX}-channel-item.selected .${CSS_PREFIX}-channel-checkbox::after {
	content: '✓';
	color: white;
	font-size: 12px;
	font-weight: bold;
}

.${CSS_PREFIX}-channel-icon {
	color: #6d6f78;
	font-size: 16px;
}

.${CSS_PREFIX}-channel-name {
	flex: 1;
	color: #dbdee1;
	font-size: 14px;
	white-space: nowrap;
	overflow: hidden;
	text-overflow: ellipsis;
}

.${CSS_PREFIX}-channel-category {
	font-size: 11px;
	color: #6d6f78;
	text-transform: uppercase;
	letter-spacing: 0.5px;
	padding: 8px 12px 4px;
	font-weight: 600;
}

.${CSS_PREFIX}-selected-count {
	font-size: 12px;
	color: #5865f2;
	margin-top: 8px;
	text-align: center;
}

.${CSS_PREFIX}-channel-loading {
	display: flex;
	align-items: center;
	justify-content: center;
	padding: 20px;
	gap: 8px;
	color: #6d6f78;
}

/* Wizard Steps */
.${CSS_PREFIX}-wizard-step {
	display: none;
}

.${CSS_PREFIX}-wizard-step.active {
	display: block;
	animation: detcord-step-in 0.25s ease-out;
}

/* Waiting/Loading State */
.${CSS_PREFIX}-waiting {
	display: flex;
	align-items: center;
	justify-content: center;
	gap: 8px;
	padding: 12px;
	background: rgba(88, 101, 242, 0.1);
	border-radius: 8px;
	margin-top: 12px;
	color: #b5bac1;
	font-size: 13px;
}

.${CSS_PREFIX}-spinner {
	width: 16px;
	height: 16px;
	border: 2px solid #3f4147;
	border-top-color: #5865f2;
	border-radius: 50%;
	animation: detcord-spin 0.8s linear infinite;
}

@keyframes detcord-spin {
	to { transform: rotate(360deg); }
}

/* Hide steps indicator on non-setup screens */
.${CSS_PREFIX}-window:has([data-screen="running"].active) .${CSS_PREFIX}-steps,
.${CSS_PREFIX}-window:has([data-screen="complete"].active) .${CSS_PREFIX}-steps,
.${CSS_PREFIX}-window:has([data-screen="error"].active) .${CSS_PREFIX}-steps,
.${CSS_PREFIX}-window:has([data-screen="preview"].active) .${CSS_PREFIX}-steps {
	display: none;
}
`;

// =============================================================================
// HTML Templates
// =============================================================================

const TRIGGER_ICON = `
<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
	<path d="M19 4H5c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zm0 14H5V8h14v10zm-9-4h4v2h-4z"/>
</svg>
`;

const CLOSE_ICON = `
<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
	<path d="M18.3 5.71a.996.996 0 00-1.41 0L12 10.59 7.11 5.7A.996.996 0 105.7 7.11L10.59 12 5.7 16.89a.996.996 0 101.41 1.41L12 13.41l4.89 4.89a.996.996 0 101.41-1.41L13.41 12l4.89-4.89c.38-.38.38-1.02 0-1.4z"/>
</svg>
`;

const MINIMIZE_ICON = `
<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
	<path d="M19 13H5v-2h14v2z"/>
</svg>
`;

function createWindowHTML(): string {
  return `
<div class="${CSS_PREFIX}-backdrop"></div>
<div class="${CSS_PREFIX}-window">
	<div class="${CSS_PREFIX}-header">
		<h2>Detcord</h2>
		<div class="${CSS_PREFIX}-header-buttons">
			<button class="${CSS_PREFIX}-minimize" data-action="minimize">${MINIMIZE_ICON}</button>
			<button class="${CSS_PREFIX}-close" data-action="close">${CLOSE_ICON}</button>
		</div>
	</div>

	<!-- Step Indicator -->
	<div class="${CSS_PREFIX}-steps" data-bind="stepIndicator">
		<div class="${CSS_PREFIX}-step-dot active" data-step="0"></div>
		<div class="${CSS_PREFIX}-step-dot" data-step="1"></div>
		<div class="${CSS_PREFIX}-step-dot" data-step="2"></div>
		<div class="${CSS_PREFIX}-step-dot" data-step="3"></div>
	</div>

	<div class="${CSS_PREFIX}-content">
		<!-- Setup Screen (Wizard Steps) -->
		<div class="${CSS_PREFIX}-screen active" data-screen="setup">

			<!-- Step 1: Location -->
			<div class="${CSS_PREFIX}-wizard-step active" data-wizard-step="location">
				<h3 class="${CSS_PREFIX}-step-title">Where should we clean?</h3>

				<div class="${CSS_PREFIX}-cards">
					<div class="${CSS_PREFIX}-card selected" data-target="channel" data-action="selectTarget">
						<div class="${CSS_PREFIX}-card-icon">📺</div>
						<div class="${CSS_PREFIX}-card-title">Channel</div>
						<div class="${CSS_PREFIX}-card-desc">Current channel</div>
					</div>
					<div class="${CSS_PREFIX}-card" data-target="server" data-action="selectTarget" data-bind="serverCard">
						<div class="${CSS_PREFIX}-card-icon">🏰</div>
						<div class="${CSS_PREFIX}-card-title">Whole Server</div>
						<div class="${CSS_PREFIX}-card-desc">All your messages</div>
					</div>
					<div class="${CSS_PREFIX}-card" data-target="dm" data-action="selectTarget" data-bind="dmCard">
						<div class="${CSS_PREFIX}-card-icon">💬</div>
						<div class="${CSS_PREFIX}-card-title">DM</div>
						<div class="${CSS_PREFIX}-card-desc">This conversation</div>
					</div>
					<div class="${CSS_PREFIX}-card" data-target="manual" data-action="selectTarget">
						<div class="${CSS_PREFIX}-card-icon">🎯</div>
						<div class="${CSS_PREFIX}-card-title">Specific</div>
						<div class="${CSS_PREFIX}-card-desc">Pick channels</div>
					</div>
				</div>

				<div class="${CSS_PREFIX}-channel-picker" data-bind="channelPicker">
					<input type="text" class="${CSS_PREFIX}-channel-search" data-input="channelSearch" placeholder="Search channels...">
					<div class="${CSS_PREFIX}-channel-list" data-bind="channelList">
						<div class="${CSS_PREFIX}-channel-loading">
							<div class="${CSS_PREFIX}-spinner"></div>
							<span>Loading channels...</span>
						</div>
					</div>
					<div class="${CSS_PREFIX}-selected-count" data-bind="selectedChannelCount"></div>
				</div>
				<div class="${CSS_PREFIX}-manual-input" data-bind="manualIdContainer">
					<input type="text" data-input="manualChannelId" placeholder="Or enter channel ID manually...">
				</div>

				<div class="${CSS_PREFIX}-btn-group">
					<button class="${CSS_PREFIX}-btn ${CSS_PREFIX}-btn-primary" data-action="nextStep" style="flex: 1;">
						Continue
					</button>
				</div>
			</div>

			<!-- Step 2: Time Range -->
			<div class="${CSS_PREFIX}-wizard-step" data-wizard-step="timerange">
				<h3 class="${CSS_PREFIX}-step-title">How far back?</h3>

				<div class="${CSS_PREFIX}-options">
					<div class="${CSS_PREFIX}-option selected" data-timerange="all" data-action="selectTimeRange">
						<div class="${CSS_PREFIX}-option-radio"></div>
						<div class="${CSS_PREFIX}-option-label">Everything</div>
						<div class="${CSS_PREFIX}-option-hint">∞</div>
					</div>
					<div class="${CSS_PREFIX}-option" data-timerange="24h" data-action="selectTimeRange">
						<div class="${CSS_PREFIX}-option-radio"></div>
						<div class="${CSS_PREFIX}-option-label">Last 24 hours</div>
						<div class="${CSS_PREFIX}-option-hint">24h</div>
					</div>
					<div class="${CSS_PREFIX}-option" data-timerange="72h" data-action="selectTimeRange">
						<div class="${CSS_PREFIX}-option-radio"></div>
						<div class="${CSS_PREFIX}-option-label">Last 3 days</div>
						<div class="${CSS_PREFIX}-option-hint">72h</div>
					</div>
					<div class="${CSS_PREFIX}-option" data-timerange="30d" data-action="selectTimeRange">
						<div class="${CSS_PREFIX}-option-radio"></div>
						<div class="${CSS_PREFIX}-option-label">Last 30 days</div>
						<div class="${CSS_PREFIX}-option-hint">30d</div>
					</div>
					<div class="${CSS_PREFIX}-option" data-timerange="older-30d" data-action="selectTimeRange">
						<div class="${CSS_PREFIX}-option-radio"></div>
						<div class="${CSS_PREFIX}-option-label">Older than 30 days</div>
						<div class="${CSS_PREFIX}-option-hint">&gt;30d</div>
					</div>
					<div class="${CSS_PREFIX}-option" data-timerange="older-90d" data-action="selectTimeRange">
						<div class="${CSS_PREFIX}-option-radio"></div>
						<div class="${CSS_PREFIX}-option-label">Older than 90 days</div>
						<div class="${CSS_PREFIX}-option-hint">&gt;90d</div>
					</div>
					<div class="${CSS_PREFIX}-option" data-timerange="custom" data-action="selectTimeRange">
						<div class="${CSS_PREFIX}-option-radio"></div>
						<div class="${CSS_PREFIX}-option-label">Custom range</div>
						<div class="${CSS_PREFIX}-option-hint">📅</div>
					</div>
				</div>

				<div class="${CSS_PREFIX}-date-range" data-bind="dateRangeContainer">
					<input type="date" data-input="afterDate" placeholder="From">
					<input type="date" data-input="beforeDate" placeholder="To">
				</div>

				<div class="${CSS_PREFIX}-btn-group">
					<button class="${CSS_PREFIX}-btn ${CSS_PREFIX}-btn-ghost" data-action="prevStep">Back</button>
					<button class="${CSS_PREFIX}-btn ${CSS_PREFIX}-btn-primary" data-action="nextStep" style="flex: 1;">
						Continue
					</button>
				</div>
			</div>

			<!-- Step 3: Filters -->
			<div class="${CSS_PREFIX}-wizard-step" data-wizard-step="filters">
				<h3 class="${CSS_PREFIX}-step-title">Any filters?</h3>

				<div class="${CSS_PREFIX}-toggles">
					<div class="${CSS_PREFIX}-toggle">
						<span class="${CSS_PREFIX}-toggle-label">Only with links</span>
						<div class="${CSS_PREFIX}-toggle-switch" data-toggle="hasLink" data-action="toggleFilter"></div>
					</div>
					<div class="${CSS_PREFIX}-toggle">
						<span class="${CSS_PREFIX}-toggle-label">Only with attachments</span>
						<div class="${CSS_PREFIX}-toggle-switch" data-toggle="hasFile" data-action="toggleFilter"></div>
					</div>
					<div class="${CSS_PREFIX}-toggle">
						<span class="${CSS_PREFIX}-toggle-label">Include pinned messages</span>
						<div class="${CSS_PREFIX}-toggle-switch" data-toggle="includePinned" data-action="toggleFilter"></div>
					</div>
				</div>

				<div class="${CSS_PREFIX}-deletion-order">
					<label class="${CSS_PREFIX}-deletion-order-label">Deletion order</label>
					<div class="${CSS_PREFIX}-radio-group">
						<label class="${CSS_PREFIX}-radio">
							<input type="radio" name="deletionOrder" value="newest" checked>
							<span class="${CSS_PREFIX}-radio-label">Newest first</span>
						</label>
						<label class="${CSS_PREFIX}-radio">
							<input type="radio" name="deletionOrder" value="oldest">
							<span class="${CSS_PREFIX}-radio-label">Oldest first</span>
						</label>
					</div>
				</div>

				<div class="${CSS_PREFIX}-filter-input">
					<label>Text filter (optional)</label>
					<input type="text" data-input="contentFilter" placeholder="Messages containing...">
				</div>

				<div class="${CSS_PREFIX}-btn-group">
					<button class="${CSS_PREFIX}-btn ${CSS_PREFIX}-btn-ghost" data-action="prevStep">Back</button>
					<button class="${CSS_PREFIX}-btn ${CSS_PREFIX}-btn-primary" data-action="nextStep" style="flex: 1;">
						Continue
					</button>
				</div>
			</div>

			<!-- Step 4: Review -->
			<div class="${CSS_PREFIX}-wizard-step" data-wizard-step="review">
				<h3 class="${CSS_PREFIX}-step-title">Ready to sweep</h3>

				<div class="${CSS_PREFIX}-summary">
					<div class="${CSS_PREFIX}-summary-count" data-bind="reviewCount">...</div>
					<div class="${CSS_PREFIX}-summary-label">messages found</div>
					<div class="${CSS_PREFIX}-summary-details" data-bind="reviewDetails">Scanning...</div>
				</div>

				<div class="${CSS_PREFIX}-preview-list" data-bind="previewList">
					<div class="${CSS_PREFIX}-preview-label">Preview</div>
					<div class="${CSS_PREFIX}-preview-messages" data-bind="previewContent">
						<div class="${CSS_PREFIX}-preview-msg">Scanning messages...</div>
					</div>
				</div>

				<div class="${CSS_PREFIX}-btn-group">
					<button class="${CSS_PREFIX}-btn ${CSS_PREFIX}-btn-ghost" data-action="prevStep">Back</button>
					<button class="${CSS_PREFIX}-btn ${CSS_PREFIX}-btn-sweep" data-action="confirmDelete" style="flex: 1;">
						🧹 Begin Sweep
					</button>
				</div>
			</div>
		</div>

		<!-- Preview Screen (legacy, for direct scan) -->
		<div class="${CSS_PREFIX}-screen" data-screen="preview">
			<h3 class="${CSS_PREFIX}-step-title">Review Before Sweep</h3>
			<div data-bind="legacyPreviewContent">
				<p style="color: #b5bac1; text-align: center;">Scanning...</p>
			</div>
			<div class="${CSS_PREFIX}-btn-group">
				<button class="${CSS_PREFIX}-btn ${CSS_PREFIX}-btn-secondary" data-action="backToSetup" style="flex: 1;">
					Back
				</button>
				<button class="${CSS_PREFIX}-btn ${CSS_PREFIX}-btn-sweep" data-action="confirmDelete" style="flex: 1;">
					🧹 Begin Sweep
				</button>
			</div>
		</div>

		<!-- Running Screen -->
		<div class="${CSS_PREFIX}-screen" data-screen="running">
			<!-- Status Speaker -->
			<div class="${CSS_PREFIX}-status-speaker">
				<div class="${CSS_PREFIX}-speaker-avatar">🧹</div>
				<div class="${CSS_PREFIX}-speaker-bubble">
					<div class="${CSS_PREFIX}-status-message" data-bind="statusMessage">"Nothing to see here..."</div>
				</div>
			</div>

			<div class="${CSS_PREFIX}-progress-container">
				<!-- Circular Progress Ring -->
				<div class="${CSS_PREFIX}-progress-ring-container">
					<svg class="${CSS_PREFIX}-progress-ring" viewBox="0 0 120 120">
						<defs>
							<linearGradient id="detcord-gradient" x1="0%" y1="0%" x2="100%" y2="0%">
								<stop offset="0%" style="stop-color:#5865f2"/>
								<stop offset="50%" style="stop-color:#7289da"/>
								<stop offset="100%" style="stop-color:#5865f2"/>
							</linearGradient>
						</defs>
						<circle class="${CSS_PREFIX}-progress-ring-bg" cx="60" cy="60" r="52"/>
						<circle class="${CSS_PREFIX}-progress-ring-fill" cx="60" cy="60" r="52" data-bind="progressRing"/>
					</svg>
					<div class="${CSS_PREFIX}-progress-ring-text">
						<div class="${CSS_PREFIX}-progress-percent" data-bind="progressPercent">0%</div>
						<div class="${CSS_PREFIX}-progress-count" data-bind="progressCount">0 / 0</div>
					</div>
				</div>

				<!-- Stats Grid -->
				<div class="${CSS_PREFIX}-progress-stats">
					<div class="${CSS_PREFIX}-stat">
						<div class="${CSS_PREFIX}-stat-value success" data-bind="deletedCount">0</div>
						<div class="${CSS_PREFIX}-stat-label">Deleted</div>
					</div>
					<div class="${CSS_PREFIX}-stat">
						<div class="${CSS_PREFIX}-stat-value error" data-bind="failedCount">0</div>
						<div class="${CSS_PREFIX}-stat-label">Failed</div>
					</div>
					<div class="${CSS_PREFIX}-stat">
						<div class="${CSS_PREFIX}-stat-value rate" data-bind="rateValue">0</div>
						<div class="${CSS_PREFIX}-stat-label">Per Min</div>
					</div>
				</div>

				<!-- Time Stats -->
				<div class="${CSS_PREFIX}-time-stats">
					<div class="${CSS_PREFIX}-time-stat">
						<span class="${CSS_PREFIX}-time-label">Elapsed:</span>
						<span class="${CSS_PREFIX}-time-value" data-bind="elapsedTime">0:00</span>
					</div>
					<div class="${CSS_PREFIX}-time-stat">
						<span class="${CSS_PREFIX}-time-label">ETA:</span>
						<span class="${CSS_PREFIX}-time-value" data-bind="eta">--:--</span>
					</div>
					<div class="${CSS_PREFIX}-time-stat" data-bind="throttleInfo" style="display: none;">
						<span class="${CSS_PREFIX}-time-label">Throttled:</span>
						<span class="${CSS_PREFIX}-time-value" data-bind="throttleCount">0x</span>
					</div>
				</div>

				<!-- Progress Bar -->
				<div class="${CSS_PREFIX}-progress-bar-container">
					<div class="${CSS_PREFIX}-progress-bar" data-bind="progressBar" style="width: 0%"></div>
				</div>

				<!-- Current Message -->
				<div class="${CSS_PREFIX}-current-message" data-bind="currentMessage">Starting...</div>
			</div>

			<div class="${CSS_PREFIX}-feed" data-bind="feed"></div>

			<div class="${CSS_PREFIX}-btn-group">
				<button class="${CSS_PREFIX}-btn ${CSS_PREFIX}-btn-secondary" data-action="pause" style="flex: 1;">
					Pause
				</button>
				<button class="${CSS_PREFIX}-btn ${CSS_PREFIX}-btn-secondary" data-action="stop" style="flex: 1;">
					Stop
				</button>
			</div>
		</div>

		<!-- Complete Screen -->
		<div class="${CSS_PREFIX}-screen" data-screen="complete">
			<div class="${CSS_PREFIX}-confetti-container" data-bind="confettiContainer"></div>

			<div class="${CSS_PREFIX}-complete">
				<div class="${CSS_PREFIX}-complete-icon">✨</div>
				<h3 class="${CSS_PREFIX}-complete-title">All clean!</h3>
				<div class="${CSS_PREFIX}-complete-stats" data-bind="completeSummary">0 messages swept</div>
				<div class="${CSS_PREFIX}-complete-time" data-bind="completeDuration">in 0 seconds</div>
				<div class="${CSS_PREFIX}-complete-throttle" data-bind="completeThrottle" style="display: none;"></div>
			</div>

			<div class="${CSS_PREFIX}-btn-group">
				<button class="${CSS_PREFIX}-btn ${CSS_PREFIX}-btn-primary" data-action="reset" style="flex: 1;">
					Sweep More
				</button>
			</div>
		</div>

		<!-- Error Screen -->
		<div class="${CSS_PREFIX}-screen" data-screen="error">
			<div class="${CSS_PREFIX}-error-message" data-bind="errorMessage">
				An error occurred.
			</div>

			<div class="${CSS_PREFIX}-form-group" data-bind="tokenInputContainer">
				<label>Manual Token Entry</label>
				<input type="password" data-input="manualToken" placeholder="Paste your Discord token...">
				<p style="font-size: 11px; color: #6d6f78; margin-top: 8px;">
					DevTools → Application → Local Storage → token
				</p>
			</div>

			<div class="${CSS_PREFIX}-btn-group">
				<button class="${CSS_PREFIX}-btn ${CSS_PREFIX}-btn-primary" data-action="useManualToken" style="flex: 1;">
					Use Token
				</button>
				<button class="${CSS_PREFIX}-btn ${CSS_PREFIX}-btn-secondary" data-action="reset" style="flex: 1;">
					Try Again
				</button>
			</div>
		</div>
	</div>
</div>
`;
}

// =============================================================================
// DetcordUI Class
// =============================================================================

/**
 * Main UI controller for Detcord.
 *
 * Manages the floating window interface, connects to the DeletionEngine,
 * and handles all user interactions with performance-optimized updates.
 */
export class DetcordUI {
  // Configuration
  private readonly options: Required<DetcordUIOptions>;

  // State
  private mounted = false;
  private visible = false;
  private _currentScreen: ScreenId = 'setup';
  private isPaused = false;
  private token: string | null = null;
  private authorId: string | null = null;

  // DOM elements
  private container: HTMLDivElement | null = null;
  private triggerButton: HTMLButtonElement | null = null;
  private windowEl: HTMLElement | null = null;
  private backdropEl: HTMLElement | null = null;

  // Engine
  private engine: DeletionEngine | null = null;
  private apiClient: DiscordApiClient | null = null;

  // Performance utilities
  private readonly cleanup = createCleanupManager();
  private readonly feedEntries: ReturnType<typeof createBoundedArray<FeedEntry>>;
  private throttledProgressUpdate:
    | ((state: DeletionEngineState, stats: DeletionEngineStats) => void)
    | null = null;
  private throttledFeedUpdate: (() => void) | null = null;
  private pendingFeedEntries: FeedEntry[] = [];
  private feedUpdateScheduled = false;

  // Dragging state
  private isDragging = false;
  private dragStartX = 0;
  private dragStartY = 0;
  private windowStartX = 0;
  private windowStartY = 0;

  // Throttled functions for cleanup tracking
  private throttledFunctions: Array<{ cancel: () => void }> = [];

  // Cached progress elements for efficient updates
  private progressElements: {
    ring: SVGCircleElement | null;
    bar: HTMLElement | null;
    percent: HTMLElement | null;
    count: HTMLElement | null;
    deleted: HTMLElement | null;
    failed: HTMLElement | null;
    total: HTMLElement | null;
    eta: HTMLElement | null;
    rate: HTMLElement | null;
    currentMessage: HTMLElement | null;
    elapsedTime: HTMLElement | null;
    throttleInfo: HTMLElement | null;
    throttleCount: HTMLElement | null;
  } | null = null;

  // Lazy token detection flag
  private tokenDetected = false;

  // Preview state
  private previewMessages: PreviewMessage[] = [];
  private previewTotalCount = 0;

  // Status rotation
  private statusRotator: { start: () => void; stop: () => void } | null = null;

  // Countdown cancellation (assigned for potential future use)
  private _countdownCancel: (() => void) | null = null;

  // Wizard state
  private currentWizardStep = 0;
  private wizardSteps: WizardStep[] = ['location', 'timerange', 'filters', 'review'];
  private selectedTarget: TargetScope = 'channel';
  private selectedTimeRange = 'all';
  private filterStates: Record<string, boolean> = {
    hasLink: false,
    hasFile: false,
    includePinned: false,
  };

  // Waiting state
  private waitingIndicator: HTMLElement | null = null;

  // Minimize state
  private isMinimized = false;
  private miniIndicator: HTMLElement | null = null;

  // Channel picker state
  private availableChannels: Array<{ id: string; name: string; category: string | undefined }> = [];
  private selectedChannels: Set<string> = new Set();
  private channelsLoading = false;

  /**
   * Creates a new DetcordUI instance.
   *
   * @param options - Optional configuration
   */
  constructor(options?: DetcordUIOptions) {
    this.options = {
      onShow: options?.onShow ?? (() => {}),
      onHide: options?.onHide ?? (() => {}),
      maxFeedEntries: options?.maxFeedEntries ?? DEFAULT_MAX_FEED_ENTRIES,
      progressThrottleMs: options?.progressThrottleMs ?? DEFAULT_PROGRESS_THROTTLE_MS,
      feedThrottleMs: options?.feedThrottleMs ?? DEFAULT_FEED_THROTTLE_MS,
    };

    this.feedEntries = createBoundedArray<FeedEntry>(this.options.maxFeedEntries);

    // Create throttled update functions and track them for cleanup
    this.throttledProgressUpdate = throttle(
      (state: DeletionEngineState, stats: DeletionEngineStats) => {
        this.updateProgressUI(state, stats);
      },
      this.options.progressThrottleMs,
    );
    this.throttledFunctions.push(
      this.throttledProgressUpdate as ThrottledFunction<
        (state: DeletionEngineState, stats: DeletionEngineStats) => void
      >,
    );

    this.throttledFeedUpdate = throttle(() => {
      this.flushFeedUpdates();
    }, this.options.feedThrottleMs);
    this.throttledFunctions.push(this.throttledFeedUpdate as ThrottledFunction<() => void>);
  }

  // =========================================================================
  // Public Lifecycle Methods
  // =========================================================================

  /**
   * Mounts the UI into the DOM.
   * Injects styles, creates the trigger button and window.
   */
  mount(): void {
    if (this.mounted) {
      return;
    }

    // Inject styles
    this.injectStyles();

    // Create container
    this.container = document.createElement('div');
    this.container.id = `${CSS_PREFIX}-container`;

    // Create trigger button
    this.triggerButton = document.createElement('button');
    this.triggerButton.className = `${CSS_PREFIX}-trigger`;
    this.triggerButton.innerHTML = TRIGGER_ICON;
    this.triggerButton.setAttribute('aria-label', 'Open Detcord');
    this.triggerButton.setAttribute('data-action', 'toggle');

    // Create window
    const windowContainer = document.createElement('div');
    windowContainer.innerHTML = createWindowHTML();

    this.container.appendChild(this.triggerButton);
    this.container.appendChild(windowContainer);
    document.body.appendChild(this.container);

    // Cache element references
    this.windowEl = this.container.querySelector(`.${CSS_PREFIX}-window`);
    this.backdropEl = this.container.querySelector(`.${CSS_PREFIX}-backdrop`);

    // Setup event delegation
    this.setupEventDelegation();

    // Setup dragging
    this.setupDragging();

    // Token detection is deferred to first show() for lazy loading

    this.mounted = true;
  }

  /**
   * Unmounts the UI from the DOM.
   * Cleans up all event listeners and resources.
   */
  unmount(): void {
    if (!this.mounted) {
      return;
    }

    // Stop any running deletion
    if (this.engine) {
      this.engine.stop();
      this.engine = null;
    }

    // Cancel any running countdown
    if (this._countdownCancel) {
      this._countdownCancel();
      this._countdownCancel = null;
    }

    // Cancel all throttled functions to prevent pending updates
    for (const fn of this.throttledFunctions) {
      fn.cancel();
    }
    this.throttledFunctions = [];

    // Dispose all cleanup functions
    this.cleanup.dispose();

    // Remove container from DOM
    this.container?.remove();
    this.container = null;
    this.triggerButton = null;
    this.windowEl = null;
    this.backdropEl = null;

    // Clear cached progress elements
    this.progressElements = null;

    // Remove styles
    const styleEl = document.getElementById(`${CSS_PREFIX}-styles`);
    styleEl?.remove();

    this.mounted = false;
    this.visible = false;
  }

  /**
   * Shows the window.
   * Token detection is performed lazily on first show.
   */
  show(): void {
    if (!this.mounted || this.visible) {
      return;
    }

    // Lazy token detection on first show
    if (!this.tokenDetected) {
      this.detectToken();
      this.tokenDetected = true;
    }

    this.windowEl?.classList.add('visible');
    this.backdropEl?.classList.add('visible');
    this.visible = true;

    // Update channel info
    this.updateChannelInfo();

    this.options.onShow();
  }

  /**
   * Hides the window.
   */
  hide(): void {
    if (!this.visible) {
      return;
    }

    this.windowEl?.classList.remove('visible');
    this.backdropEl?.classList.remove('visible');
    this.visible = false;

    this.options.onHide();
  }

  /**
   * Returns whether the window is currently visible.
   */
  isVisible(): boolean {
    return this.visible;
  }

  /**
   * Returns whether deletion is currently running.
   */
  isRunning(): boolean {
    return this.engine?.getState().running ?? false;
  }

  /**
   * Returns the current screen ID.
   */
  getCurrentScreen(): ScreenId {
    return this._currentScreen;
  }

  // =========================================================================
  // Screen Navigation
  // =========================================================================

  /**
   * Switches to a different screen with transition.
   *
   * @param screenId - The screen to show
   */
  showScreen(screenId: ScreenId): void {
    if (!this.windowEl) return;

    // Hide all screens
    const screens = this.windowEl.querySelectorAll('[data-screen]');
    for (const screen of screens) {
      screen.classList.remove('active');
    }

    // Show target screen
    const targetScreen = this.windowEl.querySelector(`[data-screen="${screenId}"]`);
    targetScreen?.classList.add('active');

    this._currentScreen = screenId;
  }

  // =========================================================================
  // Private: Setup Methods
  // =========================================================================

  /**
   * Injects component styles into the document head.
   */
  private injectStyles(): void {
    if (document.getElementById(`${CSS_PREFIX}-styles`)) {
      return;
    }

    const styleEl = document.createElement('style');
    styleEl.id = `${CSS_PREFIX}-styles`;
    styleEl.textContent = STYLES;
    document.head.appendChild(styleEl);
  }

  /**
   * Sets up event delegation on the container.
   * Uses a single event listener for all interactions.
   */
  private setupEventDelegation(): void {
    if (!this.container) return;

    const handleClick = (event: Event) => {
      const target = event.target as HTMLElement;
      const actionEl = target.closest('[data-action]') as HTMLElement | null;

      if (!actionEl) return;

      const action = actionEl.getAttribute('data-action');

      switch (action) {
        case 'toggle':
          if (this.visible) {
            this.hide();
          } else {
            this.show();
          }
          break;
        case 'close':
          this.hide();
          break;
        case 'scan':
          this.handleScan();
          break;
        case 'backToSetup':
          this.handleBackToSetup();
          break;
        case 'confirmDelete':
          this.handleConfirmDelete();
          break;
        case 'start':
          this.handleStart();
          break;
        case 'pause':
          this.handlePause();
          break;
        case 'stop':
          this.handleStop();
          break;
        case 'reset':
          this.handleReset();
          break;
        case 'useManualToken':
          this.handleManualToken();
          break;
        case 'nextStep':
          this.handleNextStep();
          break;
        case 'prevStep':
          this.handlePrevStep();
          break;
        case 'selectTarget':
          this.handleSelectTarget(actionEl);
          break;
        case 'selectTimeRange':
          this.handleSelectTimeRange(actionEl);
          break;
        case 'toggleFilter':
          this.handleToggleFilter(actionEl);
          break;
        case 'toggleChannel':
          this.handleToggleChannel(actionEl);
          break;
        case 'minimize':
          this.handleMinimize();
          break;
        case 'maximize':
          this.handleMaximize();
          break;
      }
    };

    this.container.addEventListener('click', handleClick);
    this.cleanup.add(() => {
      this.container?.removeEventListener('click', handleClick);
    });

    // Backdrop click to close
    if (this.backdropEl) {
      const backdropClick = () => this.hide();
      this.backdropEl.addEventListener('click', backdropClick);
      this.cleanup.add(() => {
        this.backdropEl?.removeEventListener('click', backdropClick);
      });
    }

    // Escape key to close
    const handleKeydown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && this.visible) {
        this.hide();
      }
    };
    document.addEventListener('keydown', handleKeydown);
    this.cleanup.add(() => {
      document.removeEventListener('keydown', handleKeydown);
    });

    // Radio button change handler for showing/hiding manual ID input
    const handleRadioChange = (event: Event) => {
      const target = event.target as HTMLInputElement;
      if (target.name === 'targetScope') {
        const manualContainer = this.windowEl?.querySelector(
          '[data-bind="manualIdContainer"]',
        ) as HTMLElement | null;
        if (manualContainer) {
          manualContainer.style.display = target.value === 'manual' ? 'block' : 'none';
        }
      }
    };
    this.container.addEventListener('change', handleRadioChange);
    this.cleanup.add(() => {
      this.container?.removeEventListener('change', handleRadioChange);
    });
  }

  /**
   * Sets up draggable window functionality.
   * Uses throttled mousemove handler (16ms = ~60fps) for better performance.
   */
  private setupDragging(): void {
    const header = this.windowEl?.querySelector(`.${CSS_PREFIX}-header`) as HTMLElement | null;
    if (!header || !this.windowEl) return;

    const handleMouseDown = (event: MouseEvent) => {
      if ((event.target as HTMLElement).closest('[data-action]')) {
        return; // Don't start drag on buttons
      }

      this.isDragging = true;
      this.dragStartX = event.clientX;
      this.dragStartY = event.clientY;

      const rect = this.windowEl?.getBoundingClientRect();
      if (!rect) return;
      this.windowStartX = rect.left + rect.width / 2;
      this.windowStartY = rect.top + rect.height / 2;

      event.preventDefault();
    };

    // Throttle mousemove to ~60fps (16ms) to prevent DOM thrashing
    const handleMouseMove = throttle((event: MouseEvent) => {
      if (!this.isDragging || !this.windowEl) return;

      const deltaX = event.clientX - this.dragStartX;
      const deltaY = event.clientY - this.dragStartY;

      let newX = this.windowStartX + deltaX;
      let newY = this.windowStartY + deltaY;

      // Constrain to viewport
      const rect = this.windowEl.getBoundingClientRect();
      const halfWidth = rect.width / 2;
      const halfHeight = rect.height / 2;

      newX = Math.max(halfWidth, Math.min(window.innerWidth - halfWidth, newX));
      newY = Math.max(halfHeight, Math.min(window.innerHeight - halfHeight, newY));

      this.windowEl.style.left = `${newX}px`;
      this.windowEl.style.top = `${newY}px`;
      this.windowEl.style.transform = 'translate(-50%, -50%)';
    }, 16);

    // Track throttled function for cleanup
    this.throttledFunctions.push(handleMouseMove);

    const handleMouseUp = () => {
      this.isDragging = false;
    };

    header.addEventListener('mousedown', handleMouseDown);
    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);

    this.cleanup.add(() => {
      header.removeEventListener('mousedown', handleMouseDown);
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    });
  }

  /**
   * Detects the Discord token from the browser environment.
   */
  private detectToken(): void {
    try {
      this.token = getToken();
      this.authorId = getAuthorId();

      if (!this.token) {
        this.showError('Could not detect Discord token. Please make sure you are logged in.');
      }
    } catch {
      this.showError('Failed to extract authentication token.');
    }
  }

  // =========================================================================
  // Private: Action Handlers
  // =========================================================================

  /**
   * Handles the start action.
   */
  private handleStart(): void {
    if (!this.token || !this.authorId) {
      this.showError('Authentication token not found. Please refresh the page and try again.');
      return;
    }

    // Get configuration from form
    const config = this.getFormConfig();

    if (!config.channelId) {
      this.showError(
        'Could not detect current channel. Please navigate to a channel and try again.',
      );
      return;
    }

    // Validate pattern if provided
    if (config.pattern) {
      try {
        new RegExp(config.pattern);
      } catch {
        this.showError(`Invalid regex pattern: ${config.pattern}`);
        return;
      }
    }

    // Create API client and engine
    // Cast to the engine's interface - the class implements the required methods
    this.apiClient = new DiscordApiClient(this.token);
    this.engine = new DeletionEngine(
      this.apiClient as unknown as import('../core/deletion-engine').DiscordApiClient,
    );

    // Configure engine - build options object without undefined values
    // to satisfy exactOptionalPropertyTypes
    const engineOptions: Parameters<typeof this.engine.configure>[0] = {
      authToken: this.token,
      authorId: this.authorId,
      channelId: config.channelId,
    };

    // Only use guildId for server-wide deletion scope
    if (config.targetScope === 'server' && config.guildId) {
      engineOptions.guildId = config.guildId;
    }
    if (config.afterDate) engineOptions.minId = dateToSnowflake(config.afterDate);
    if (config.beforeDate) engineOptions.maxId = dateToSnowflake(config.beforeDate);
    if (config.contentFilter) engineOptions.content = config.contentFilter;
    if (config.hasLink) engineOptions.hasLink = config.hasLink;
    if (config.hasFile) engineOptions.hasFile = config.hasFile;
    if (config.includePinned) engineOptions.includePinned = config.includePinned;
    if (config.pattern) engineOptions.pattern = config.pattern;
    if (config.deletionOrder) engineOptions.deletionOrder = config.deletionOrder;

    this.engine.configure(engineOptions);

    // Set callbacks
    this.engine.setCallbacks({
      onStart: (state, stats) => this.onEngineStart(state, stats),
      onProgress: (state, stats, message) => this.onEngineProgress(state, stats, message),
      onStop: (state, stats) => this.onEngineStop(state, stats),
      onError: (error) => this.onEngineError(error),
      onRateLimitChange: (info) => this.updateThrottleState(info.isThrottled, info.currentDelay),
      onStatus: (status) => this.onEngineStatus(status),
    });

    // Clear feed
    this.feedEntries.clear();
    this.pendingFeedEntries = [];

    // Switch to running screen and cache progress elements
    this.showScreen('running');
    this.cacheProgressElements();

    // Start deletion
    this.engine.start().catch((error) => {
      this.onEngineError(error instanceof Error ? error : new Error(String(error)));
    });
  }

  /**
   * Handles the pause/resume action.
   */
  private handlePause(): void {
    if (!this.engine) return;

    const pauseBtn = this.windowEl?.querySelector('[data-action="pause"]');

    if (this.isPaused) {
      this.engine.resume();
      this.isPaused = false;
      if (pauseBtn) pauseBtn.textContent = 'Pause';
    } else {
      this.engine.pause();
      this.isPaused = true;
      if (pauseBtn) pauseBtn.textContent = 'Resume';
    }
  }

  /**
   * Handles the stop action.
   */
  private handleStop(): void {
    this.engine?.stop();
  }

  /**
   * Handles the reset action.
   */
  private handleReset(): void {
    this.engine = null;
    this.apiClient = null;
    this.isPaused = false;
    this.feedEntries.clear();
    this.pendingFeedEntries = [];
    // Clear cached progress elements since we're leaving the running screen
    this.progressElements = null;
    // Stop status rotation if running
    this.statusRotator?.stop();
    this.statusRotator = null;
    // Clear preview state
    this.previewMessages = [];
    this.previewTotalCount = 0;
    // Reset wizard state
    this.currentWizardStep = 0;
    this.selectedTarget = 'channel';
    this.selectedTimeRange = 'all';
    this.filterStates = { hasLink: false, hasFile: false, includePinned: false };
    this.selectedChannels.clear();
    this.availableChannels = [];
    this.showScreen('setup');
    this.showWizardStep('location');
  }

  /**
   * Handles manual token entry from the error screen.
   */
  private handleManualToken(): void {
    const tokenInput = this.windowEl?.querySelector(
      '[data-input="manualToken"]',
    ) as HTMLInputElement | null;
    const manualToken = tokenInput?.value?.trim();

    if (!manualToken) {
      this.showError('Please enter a valid token.');
      return;
    }

    // Validate token format (basic check - should start with alphanumeric)
    if (!/^[A-Za-z0-9]/.test(manualToken)) {
      this.showError('Invalid token format. Token should not start with special characters.');
      return;
    }

    // Set the token and author ID (will need to get author ID from API)
    this.token = manualToken;
    this.authorId = getAuthorId(); // Try to get from browser, may still be null

    // Clear the input for security
    if (tokenInput) {
      tokenInput.value = '';
    }

    // If we still don't have author ID, show a warning but allow continuing
    if (!this.authorId) {
      // The user will need to enter author ID manually or we can try to fetch it
      this.showError(
        'Token accepted but could not detect your user ID. Please enter it manually or try refreshing.',
      );
      return;
    }

    // Success - go back to setup screen
    this.showScreen('setup');
    this.updateChannelInfo();
  }

  /**
   * Handles moving to the next wizard step.
   */
  private handleNextStep(): void {
    if (this.currentWizardStep < this.wizardSteps.length - 1) {
      this.currentWizardStep++;
      const step = this.wizardSteps[this.currentWizardStep];
      if (step) {
        this.showWizardStep(step);

        // If entering review step, trigger a scan
        if (step === 'review') {
          this.scanForReview();
        }
      }
    }
  }

  /**
   * Handles moving to the previous wizard step.
   */
  private handlePrevStep(): void {
    if (this.currentWizardStep > 0) {
      this.currentWizardStep--;
      const step = this.wizardSteps[this.currentWizardStep];
      if (step) {
        this.showWizardStep(step);
      }
    }
  }

  /**
   * Handles selecting a target location.
   */
  private handleSelectTarget(element: HTMLElement): void {
    const target = element.getAttribute('data-target') as TargetScope;
    if (!target) return;

    this.selectedTarget = target;

    // Update card selection UI
    const cards = this.windowEl?.querySelectorAll('[data-action="selectTarget"]');
    if (cards) {
      for (const card of cards) {
        card.classList.remove('selected');
      }
    }
    element.classList.add('selected');

    // Show/hide channel picker and manual input
    const channelPicker = this.windowEl?.querySelector(
      '[data-bind="channelPicker"]',
    ) as HTMLElement | null;
    const manualContainer = this.windowEl?.querySelector(
      '[data-bind="manualIdContainer"]',
    ) as HTMLElement | null;

    if (channelPicker) {
      channelPicker.classList.toggle('visible', target === 'manual');
      // Load channels when switching to "Specific" target
      if (target === 'manual') {
        this.loadChannelsForPicker();
      }
    }
    if (manualContainer) {
      manualContainer.classList.toggle('visible', target === 'manual');
    }
  }

  /**
   * Handles selecting a time range.
   */
  private handleSelectTimeRange(element: HTMLElement): void {
    const timerange = element.getAttribute('data-timerange');
    if (!timerange) return;

    this.selectedTimeRange = timerange;

    // Update option selection UI
    const options = this.windowEl?.querySelectorAll('[data-action="selectTimeRange"]');
    if (options) {
      for (const option of options) {
        option.classList.remove('selected');
      }
    }
    element.classList.add('selected');

    // Show/hide custom date range
    const dateContainer = this.windowEl?.querySelector(
      '[data-bind="dateRangeContainer"]',
    ) as HTMLElement | null;
    if (dateContainer) {
      dateContainer.classList.toggle('visible', timerange === 'custom');
    }

    // Apply quick select dates
    if (timerange !== 'custom' && timerange !== 'all') {
      this.applyQuickTimeRange(timerange);
    }
  }

  /**
   * Applies a quick time range preset.
   */
  private applyQuickTimeRange(preset: string): void {
    const now = new Date();
    let afterDate: Date | null = null;
    let beforeDate: Date | null = null;

    switch (preset) {
      case '24h':
        afterDate = new Date(now.getTime() - 24 * 60 * 60 * 1000);
        break;
      case '72h':
        afterDate = new Date(now.getTime() - 72 * 60 * 60 * 1000);
        break;
      case '30d':
        afterDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
        break;
      case '90d':
        afterDate = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
        break;
      case '1y':
        afterDate = new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000);
        break;
      case 'older-30d':
        beforeDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
        break;
      case 'older-90d':
        beforeDate = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
        break;
    }

    // Update the date inputs
    const afterInput = this.windowEl?.querySelector(
      '[data-input="afterDate"]',
    ) as HTMLInputElement | null;
    const beforeInput = this.windowEl?.querySelector(
      '[data-input="beforeDate"]',
    ) as HTMLInputElement | null;

    if (afterInput) {
      afterInput.value = afterDate ? (afterDate.toISOString().split('T')[0] ?? '') : '';
    }
    if (beforeInput) {
      beforeInput.value = beforeDate ? (beforeDate.toISOString().split('T')[0] ?? '') : '';
    }
  }

  /**
   * Handles toggling a filter switch.
   */
  private handleToggleFilter(element: HTMLElement): void {
    const toggle = element.getAttribute('data-toggle');
    if (!toggle) return;

    // Toggle the state
    this.filterStates[toggle] = !this.filterStates[toggle];

    // Update UI
    element.classList.toggle('on', this.filterStates[toggle]);
  }

  /**
   * Loads channels for the picker when user selects "Specific" target.
   */
  private async loadChannelsForPicker(): Promise<void> {
    if (this.channelsLoading) return;

    const guildId = getGuildIdFromUrl();
    if (!guildId) {
      this.renderChannelList([]);
      return;
    }

    // Ensure we have an API client
    if (!this.apiClient && this.token) {
      this.apiClient = new DiscordApiClient(this.token);
    }

    if (!this.apiClient) {
      this.renderChannelList([]);
      return;
    }

    this.channelsLoading = true;

    try {
      const channels = await this.apiClient.getGuildChannels(guildId);

      // Transform to simplified structure with category info
      this.availableChannels = channels.map((ch: DiscordChannel) => ({
        id: ch.id,
        name: ch.name ?? 'Unknown',
        category: ch.parent_id ?? undefined,
      }));

      // Sort alphabetically
      this.availableChannels.sort((a, b) => a.name.localeCompare(b.name));

      this.renderChannelList(this.availableChannels);
    } catch (error) {
      console.error('[Detcord] Failed to load channels:', error);
      this.renderChannelList([]);
    } finally {
      this.channelsLoading = false;
    }
  }

  /**
   * Renders the channel list in the picker.
   */
  private renderChannelList(
    channels: Array<{ id: string; name: string; category: string | undefined }>,
  ): void {
    const listEl = this.windowEl?.querySelector('[data-bind="channelList"]') as HTMLElement;
    if (!listEl) return;

    if (channels.length === 0) {
      listEl.innerHTML = `
        <div class="${CSS_PREFIX}-channel-loading">
          <span>No channels found</span>
        </div>
      `;
      return;
    }

    // Build HTML for channel list
    const html = channels
      .map(
        (ch) => `
        <div class="${CSS_PREFIX}-channel-item ${this.selectedChannels.has(ch.id) ? 'selected' : ''}"
             data-channel-id="${ch.id}"
             data-action="toggleChannel">
          <div class="${CSS_PREFIX}-channel-checkbox"></div>
          <span class="${CSS_PREFIX}-channel-icon">#</span>
          <span class="${CSS_PREFIX}-channel-name">${escapeHtml(ch.name)}</span>
        </div>
      `,
      )
      .join('');

    listEl.innerHTML = html;
    this.updateSelectedChannelCount();

    // Setup search filtering
    this.setupChannelSearch();
  }

  /**
   * Sets up the channel search input filtering.
   */
  private setupChannelSearch(): void {
    const searchInput = this.windowEl?.querySelector(
      '[data-input="channelSearch"]',
    ) as HTMLInputElement | null;

    if (!searchInput) return;

    // Use input event for real-time filtering
    const filterChannels = (): void => {
      const query = searchInput.value.toLowerCase();
      const items = this.windowEl?.querySelectorAll('[data-channel-id]');

      if (items) {
        for (const item of items) {
          const nameEl = item.querySelector(`.${CSS_PREFIX}-channel-name`);
          const name = nameEl?.textContent?.toLowerCase() ?? '';
          (item as HTMLElement).style.display = name.includes(query) ? '' : 'none';
        }
      }
    };

    searchInput.addEventListener('input', filterChannels);
    this.cleanup.add(() => searchInput.removeEventListener('input', filterChannels));
  }

  /**
   * Handles toggling channel selection.
   */
  private handleToggleChannel(element: HTMLElement): void {
    const channelId = element.getAttribute('data-channel-id');
    if (!channelId) return;

    if (this.selectedChannels.has(channelId)) {
      this.selectedChannels.delete(channelId);
      element.classList.remove('selected');
    } else {
      this.selectedChannels.add(channelId);
      element.classList.add('selected');
    }

    this.updateSelectedChannelCount();
  }

  /**
   * Updates the selected channel count display.
   */
  private updateSelectedChannelCount(): void {
    const countEl = this.windowEl?.querySelector(
      '[data-bind="selectedChannelCount"]',
    ) as HTMLElement;
    if (!countEl) return;

    const count = this.selectedChannels.size;
    if (count === 0) {
      countEl.textContent = '';
    } else if (count === 1) {
      countEl.textContent = '1 channel selected';
    } else {
      countEl.textContent = `${count} channels selected`;
    }
  }

  /**
   * Shows a specific wizard step.
   */
  private showWizardStep(step: WizardStep): void {
    if (!this.windowEl) return;

    // Hide all wizard steps
    const steps = this.windowEl.querySelectorAll('[data-wizard-step]');
    for (const stepEl of steps) {
      stepEl.classList.remove('active');
    }

    // Show target step
    const targetStep = this.windowEl.querySelector(`[data-wizard-step="${step}"]`);
    targetStep?.classList.add('active');

    // Update step indicator dots
    this.updateStepIndicator();
  }

  /**
   * Updates the step indicator dots.
   */
  private updateStepIndicator(): void {
    const dots = this.windowEl?.querySelectorAll('[data-step]');
    if (!dots) return;

    dots.forEach((dot, index) => {
      dot.classList.remove('active', 'completed');
      if (index === this.currentWizardStep) {
        dot.classList.add('active');
      } else if (index < this.currentWizardStep) {
        dot.classList.add('completed');
      }
    });
  }

  /**
   * Handles minimizing the window.
   */
  private handleMinimize(): void {
    if (!this.isRunning()) {
      // If not running, just hide the window
      this.hide();
      return;
    }

    // Create mini indicator if not exists
    if (!this.miniIndicator) {
      this.miniIndicator = document.createElement('div');
      this.miniIndicator.className = `${CSS_PREFIX}-mini-indicator`;
      this.miniIndicator.setAttribute('data-action', 'maximize');
      this.miniIndicator.innerHTML = `
        <div class="${CSS_PREFIX}-mini-progress">
          <svg class="${CSS_PREFIX}-mini-ring" viewBox="0 0 44 44">
            <circle class="${CSS_PREFIX}-mini-ring-bg" cx="22" cy="22" r="20"/>
            <circle class="${CSS_PREFIX}-mini-ring-fill" cx="22" cy="22" r="20" data-bind="miniRing"/>
          </svg>
          <div class="${CSS_PREFIX}-mini-percent" data-bind="miniPercent">0%</div>
        </div>
      `;
      this.container?.appendChild(this.miniIndicator);
    }

    // Show mini indicator and hide main window
    this.isMinimized = true;
    this.windowEl?.classList.remove('visible');
    this.backdropEl?.classList.remove('visible');
    this.miniIndicator.classList.add('visible');
  }

  /**
   * Handles maximizing (restoring) the window from minimized state.
   */
  private handleMaximize(): void {
    if (!this.isMinimized) return;

    this.isMinimized = false;
    this.miniIndicator?.classList.remove('visible');
    this.windowEl?.classList.add('visible');
    this.backdropEl?.classList.add('visible');
  }

  /**
   * Updates the mini indicator progress.
   */
  private updateMiniProgress(percent: number): void {
    if (!this.miniIndicator || !this.isMinimized) return;

    const ring = this.miniIndicator.querySelector('[data-bind="miniRing"]') as SVGCircleElement;
    const percentEl = this.miniIndicator.querySelector('[data-bind="miniPercent"]') as HTMLElement;

    if (ring) {
      const circumference = 2 * Math.PI * 20;
      const offset = circumference - (percent / 100) * circumference;
      ring.style.strokeDasharray = String(circumference);
      ring.style.strokeDashoffset = String(offset);
    }

    if (percentEl) {
      percentEl.textContent = `${percent}%`;
    }
  }

  /**
   * Scans for messages to show in the review step.
   */
  private async scanForReview(): Promise<void> {
    if (!this.token || !this.authorId) {
      this.updateElement('reviewCount', '?');
      this.updateElement('reviewDetails', 'Token not found');
      return;
    }

    // Show loading state
    this.updateElement('reviewCount', '...');
    this.updateElement('reviewDetails', 'Scanning...');
    this.showWaitingIndicator('Searching messages...');

    const config = this.getFormConfig();
    const guildId = getGuildIdFromUrl();
    const channelId = getChannelIdFromUrl();

    // Determine what to search based on target scope
    const useChannelSearch = config.targetScope === 'channel' || config.targetScope === 'dm';
    const useServerSearch = config.targetScope === 'server';

    if (useChannelSearch && !channelId) {
      this.updateElement('reviewCount', '?');
      this.updateElement('reviewDetails', 'No channel detected');
      this.hideWaitingIndicator();
      return;
    }

    if (useServerSearch && (!guildId || guildId === '@me')) {
      this.updateElement('reviewCount', '?');
      this.updateElement('reviewDetails', 'Not in a server');
      this.hideWaitingIndicator();
      return;
    }

    // Create API client for scanning
    this.apiClient = new DiscordApiClient(this.token);

    try {
      // Build search params - use guildId or channelId based on scope
      const searchParams: Record<string, string | boolean | number> = {
        authorId: this.authorId,
      };

      // For server-wide search, use guildId. For channel, use channelId.
      if (useServerSearch && guildId) {
        searchParams.guildId = guildId;
      } else if (channelId) {
        searchParams.channelId = channelId;
      }

      if (config.afterDate) {
        searchParams.minId = dateToSnowflake(config.afterDate);
      }
      if (config.beforeDate) {
        searchParams.maxId = dateToSnowflake(config.beforeDate);
      }
      if (config.contentFilter) {
        searchParams.content = config.contentFilter;
      }
      if (config.hasLink) {
        searchParams.hasLink = true;
      }
      if (config.hasFile) {
        searchParams.hasFile = true;
      }

      const searchResult = await this.apiClient.searchMessages(searchParams);

      const messages = searchResult.messages?.flat() ?? [];
      this.previewTotalCount = searchResult.total_results ?? messages.length;
      this.previewMessages = messages.slice(0, 5).map((msg: DiscordMessage) => ({
        id: msg.id,
        content: msg.content,
        timestamp: msg.timestamp,
        authorName: msg.author?.username,
      }));

      // Update review UI
      this.updateElement('reviewCount', String(this.previewTotalCount));

      const location = config.targetScope === 'server' ? 'this server' : 'this channel';
      const timeDesc =
        this.selectedTimeRange === 'all' ? '' : ` from ${this.getTimeRangeDescription()}`;
      this.updateElement('reviewDetails', `In ${location}${timeDesc}`);

      // Update preview messages
      const previewContent = this.windowEl?.querySelector('[data-bind="previewContent"]');
      if (previewContent) {
        previewContent.innerHTML = '';
        if (this.previewMessages.length === 0) {
          previewContent.innerHTML = `<div class="${CSS_PREFIX}-preview-msg">No messages found</div>`;
        } else {
          for (const msg of this.previewMessages) {
            const msgEl = document.createElement('div');
            msgEl.className = `${CSS_PREFIX}-preview-msg`;
            const preview = msg.content || '[No text content]';
            msgEl.textContent = preview.length > 60 ? `${preview.substring(0, 60)}...` : preview;
            previewContent.appendChild(msgEl);
          }
        }
      }
    } catch (error) {
      this.updateElement('reviewCount', '?');
      this.updateElement('reviewDetails', error instanceof Error ? error.message : 'Scan failed');
    } finally {
      this.hideWaitingIndicator();
    }
  }

  /**
   * Gets a human-readable description of the selected time range.
   */
  private getTimeRangeDescription(): string {
    switch (this.selectedTimeRange) {
      case '24h':
        return 'the last 24 hours';
      case '72h':
        return 'the last 3 days';
      case '30d':
        return 'the last 30 days';
      case '90d':
        return 'the last 90 days';
      case '1y':
        return 'the last year';
      case 'older-30d':
        return 'older than 30 days';
      case 'older-90d':
        return 'older than 90 days';
      case 'custom':
        return 'custom range';
      default:
        return 'all time';
    }
  }

  /**
   * Shows a waiting indicator with a message.
   */
  private showWaitingIndicator(message: string): void {
    const content = this.windowEl?.querySelector(`.${CSS_PREFIX}-content`);
    if (!content) return;

    // Remove existing indicator
    this.hideWaitingIndicator();

    // Create waiting indicator
    this.waitingIndicator = document.createElement('div');
    this.waitingIndicator.className = `${CSS_PREFIX}-waiting`;
    this.waitingIndicator.innerHTML = `
      <div class="${CSS_PREFIX}-spinner"></div>
      <span>${escapeHtml(message)}</span>
    `;

    // Find the review step and append
    const reviewStep = this.windowEl?.querySelector('[data-wizard-step="review"]');
    const summary = reviewStep?.querySelector(`.${CSS_PREFIX}-summary`);
    if (summary) {
      summary.insertAdjacentElement('afterend', this.waitingIndicator);
    }
  }

  /**
   * Hides the waiting indicator.
   */
  private hideWaitingIndicator(): void {
    this.waitingIndicator?.remove();
    this.waitingIndicator = null;
  }

  /**
   * Handles the scan action - scans for messages and shows preview.
   */
  private async handleScan(): Promise<void> {
    if (!this.token || !this.authorId) {
      this.showError('Authentication token not found. Please refresh the page and try again.');
      return;
    }

    const config = this.getFormConfig();

    if (!config.channelId) {
      this.showError(
        'Could not detect current channel. Please navigate to a channel and try again.',
      );
      return;
    }

    // Validate pattern if provided
    if (config.pattern) {
      try {
        new RegExp(config.pattern);
      } catch {
        this.showError(`Invalid regex pattern: ${config.pattern}`);
        return;
      }
    }

    // Show preview screen with loading state
    this.showScreen('preview');

    // Create API client for scanning
    this.apiClient = new DiscordApiClient(this.token);

    try {
      // Perform initial search to get message count and samples
      // Use camelCase to match the SearchParams interface in discord-api.ts
      const searchParams: Record<string, string | boolean | number> = {
        authorId: this.authorId,
      };

      if (config.afterDate) {
        searchParams.minId = dateToSnowflake(config.afterDate);
      }
      if (config.beforeDate) {
        searchParams.maxId = dateToSnowflake(config.beforeDate);
      }
      if (config.contentFilter) {
        searchParams.content = config.contentFilter;
      }
      if (config.hasLink) {
        searchParams.hasLink = true;
      }
      if (config.hasFile) {
        searchParams.hasFile = true;
      }

      // Search for messages based on target scope
      // - 'server': search entire guild (all channels)
      // - 'channel' or 'dm': search only the current channel
      let fullSearchParams: Record<string, string>;
      if (config.targetScope === 'server' && config.guildId) {
        // Server-wide search uses guild endpoint
        fullSearchParams = { ...searchParams, guildId: config.guildId };
      } else {
        // Channel/DM search uses channel endpoint
        fullSearchParams = { ...searchParams, channelId: config.channelId };
      }

      const searchResult = await this.apiClient.searchMessages(fullSearchParams);

      // Extract sample messages
      const messages = searchResult.messages?.flat() ?? [];
      this.previewTotalCount = searchResult.total_results ?? messages.length;
      this.previewMessages = messages.slice(0, 5).map((msg: DiscordMessage) => ({
        id: msg.id,
        content: msg.content,
        timestamp: msg.timestamp,
        authorName: msg.author?.username,
      }));

      // Calculate estimated time (1 second per message + search delays)
      const estimatedSeconds = this.previewTotalCount * 1.5;
      const estimatedTime = formatDuration(estimatedSeconds * 1000);

      // Update preview content
      const previewContentEl = this.windowEl?.querySelector('[data-bind="previewContent"]');
      if (previewContentEl) {
        previewContentEl.innerHTML = '';
        const content = createPreviewScreenContent(
          this.previewTotalCount,
          estimatedTime,
          this.previewMessages,
        );
        previewContentEl.appendChild(content);
      }
    } catch (error) {
      this.showError(error instanceof Error ? error.message : 'Failed to scan messages');
    }
  }

  /**
   * Handles going back to setup from preview.
   */
  private handleBackToSetup(): void {
    this.previewMessages = [];
    this.previewTotalCount = 0;
    this.showScreen('setup');
  }

  /**
   * Handles confirmation of deletion from preview screen.
   * Runs the countdown animation then starts deletion.
   */
  private handleConfirmDelete(): void {
    if (!this.windowEl) return;

    // Run countdown sequence
    this._countdownCancel = runCountdownSequence(this.windowEl, () => {
      this._countdownCancel = null;
      // After countdown, start the actual deletion
      this.handleStart();
      // Start status message rotation
      this.startStatusRotation();
    });
  }

  /**
   * Starts the rotating status messages during deletion.
   */
  private startStatusRotation(): void {
    const statusEl = this.windowEl?.querySelector(
      '[data-bind="statusMessage"]',
    ) as HTMLElement | null;
    if (!statusEl) return;

    this.statusRotator = createStatusRotator(statusEl, 3000);
    this.statusRotator.start();
  }

  // =========================================================================
  // Private: Engine Callbacks
  // =========================================================================

  /**
   * Called when deletion starts.
   */
  private onEngineStart(_state: DeletionEngineState, _stats: DeletionEngineStats): void {
    this.updateProgressUI(
      {
        running: true,
        paused: false,
        deletedCount: 0,
        failedCount: 0,
        skippedCount: 0,
        totalFound: 0,
        initialTotalFound: 0,
        currentOffset: 0,
      },
      {
        startTime: Date.now(),
        throttledCount: 0,
        throttledTime: 0,
        averagePing: 0,
        estimatedTimeRemaining: -1,
      },
    );
  }

  /**
   * Called on each deletion progress update.
   */
  private onEngineProgress(
    state: DeletionEngineState,
    stats: DeletionEngineStats,
    message: DiscordMessage,
  ): void {
    // Add to feed (throttled)
    this.addFeedEntry({
      messageId: message.id,
      content: message.content,
      timestamp: new Date(message.timestamp),
      success: true,
    });

    // Update current message being deleted
    this.updateCurrentMessage(message.content);

    // Update progress (throttled)
    this.throttledProgressUpdate?.(state, stats);
  }

  /**
   * Called when status changes (e.g., "Finding oldest message...").
   */
  private onEngineStatus(status: string | undefined): void {
    const statusEl = this.windowEl?.querySelector('[data-bind="currentMessage"]');
    if (statusEl) {
      if (status) {
        statusEl.textContent = status;
        statusEl.classList.add(`${CSS_PREFIX}-status-searching`);
      } else {
        statusEl.classList.remove(`${CSS_PREFIX}-status-searching`);
      }
    }
  }

  /**
   * Called when deletion stops.
   */
  private onEngineStop(state: DeletionEngineState, stats: DeletionEngineStats): void {
    // Final progress update
    this.updateProgressUI(state, stats);

    // Flush any pending feed entries
    this.flushFeedUpdates();

    // Stop status rotation
    this.statusRotator?.stop();
    this.statusRotator = null;

    // Update complete screen
    this.updateElement('finalDeleted', String(state.deletedCount));
    this.updateElement('finalFailed', String(state.failedCount));
    this.updateElement('finalDuration', formatDuration(Date.now() - stats.startTime));
    this.updateElement(
      'completeSummary',
      `Processed ${state.deletedCount + state.failedCount} messages.`,
    );

    // Switch to complete screen
    this.showScreen('complete');

    // Trigger confetti celebration
    const confettiContainer = this.windowEl?.querySelector(
      '[data-bind="confettiContainer"]',
    ) as HTMLElement | null;
    if (confettiContainer && state.deletedCount > 0) {
      createConfetti(confettiContainer, 30);
    }
  }

  /**
   * Called when an error occurs.
   */
  private onEngineError(error: Error): void {
    this.showError(error.message);
  }

  // =========================================================================
  // Private: UI Updates
  // =========================================================================

  /**
   * Caches progress element references for efficient updates.
   * Should be called when transitioning to the running screen.
   */
  private cacheProgressElements(): void {
    if (!this.windowEl) return;

    this.progressElements = {
      ring: this.windowEl.querySelector('[data-bind="progressRing"]') as SVGCircleElement | null,
      bar: this.windowEl.querySelector('[data-bind="progressBar"]') as HTMLElement | null,
      percent: this.windowEl.querySelector('[data-bind="progressPercent"]') as HTMLElement | null,
      count: this.windowEl.querySelector('[data-bind="progressCount"]') as HTMLElement | null,
      deleted: this.windowEl.querySelector('[data-bind="deletedCount"]') as HTMLElement | null,
      failed: this.windowEl.querySelector('[data-bind="failedCount"]') as HTMLElement | null,
      total: this.windowEl.querySelector('[data-bind="totalCount"]') as HTMLElement | null,
      eta: this.windowEl.querySelector('[data-bind="eta"]') as HTMLElement | null,
      rate: this.windowEl.querySelector('[data-bind="rateValue"]') as HTMLElement | null,
      currentMessage: this.windowEl.querySelector(
        '[data-bind="currentMessage"]',
      ) as HTMLElement | null,
      elapsedTime: this.windowEl.querySelector('[data-bind="elapsedTime"]') as HTMLElement | null,
      throttleInfo: this.windowEl.querySelector('[data-bind="throttleInfo"]') as HTMLElement | null,
      throttleCount: this.windowEl.querySelector(
        '[data-bind="throttleCount"]',
      ) as HTMLElement | null,
    };
  }

  /**
   * Updates the progress UI with current state.
   * Uses cached element references for better performance.
   */
  private updateProgressUI(state: DeletionEngineState, stats: DeletionEngineStats): void {
    // Ensure we have cached elements
    if (!this.progressElements) {
      this.cacheProgressElements();
    }

    if (!this.progressElements) return;

    const processed = state.deletedCount + state.failedCount;
    // Use initialTotalFound for progress calculation (doesn't decrease as messages are deleted)
    const total = state.initialTotalFound || state.totalFound || 1;
    const percent = Math.min(100, Math.round((processed / total) * 100));

    // Calculate rate (messages per minute)
    const elapsedMinutes = (Date.now() - stats.startTime) / 60000;
    const rate = elapsedMinutes > 0 ? Math.round(state.deletedCount / elapsedMinutes) : 0;

    // Update progress ring (circumference = 2 * PI * 52 = ~327)
    const circumference = 2 * Math.PI * 52;
    if (this.progressElements.ring) {
      const offset = circumference - (percent / 100) * circumference;
      this.progressElements.ring.style.strokeDasharray = String(circumference);
      this.progressElements.ring.style.strokeDashoffset = String(offset);
    }

    // Update progress bar
    if (this.progressElements.bar) {
      this.progressElements.bar.style.width = `${percent}%`;
    }

    // Batch text updates using cached references
    requestAnimationFrame(() => {
      if (!this.progressElements) return;

      if (this.progressElements.percent) {
        this.progressElements.percent.textContent = `${percent}%`;
      }
      if (this.progressElements.count) {
        this.progressElements.count.textContent = `${processed} / ${total}`;
      }
      if (this.progressElements.deleted) {
        this.progressElements.deleted.textContent = String(state.deletedCount);
      }
      if (this.progressElements.failed) {
        this.progressElements.failed.textContent = String(state.failedCount);
      }
      if (this.progressElements.total) {
        // Show initialTotalFound as the total (stable value)
        this.progressElements.total.textContent = String(
          state.initialTotalFound || state.totalFound,
        );
      }
      if (this.progressElements.rate) {
        this.progressElements.rate.textContent = String(rate);
      }
      if (this.progressElements.eta) {
        if (stats.estimatedTimeRemaining > 0) {
          this.progressElements.eta.textContent = formatDuration(stats.estimatedTimeRemaining);
        } else if (state.running) {
          this.progressElements.eta.textContent = '--:--';
        } else {
          this.progressElements.eta.textContent = '';
        }
      }

      // Update elapsed time
      if (this.progressElements.elapsedTime && stats.startTime > 0) {
        const elapsed = Date.now() - stats.startTime;
        this.progressElements.elapsedTime.textContent = formatDuration(elapsed);
      }

      // Update throttle info
      if (stats.throttledCount > 0) {
        if (this.progressElements.throttleInfo) {
          (this.progressElements.throttleInfo as HTMLElement).style.display = 'flex';
        }
        if (this.progressElements.throttleCount) {
          this.progressElements.throttleCount.textContent = `${stats.throttledCount}x (${formatDuration(stats.throttledTime)})`;
        }
      }

      // Also update mini indicator if minimized
      if (this.isMinimized) {
        this.updateMiniProgress(percent);
      }
    });
  }

  /**
   * Updates the current message being deleted.
   */
  private updateCurrentMessage(content: string): void {
    if (!this.progressElements?.currentMessage) return;

    const preview = content || '[No text content]';
    const truncated = preview.length > 50 ? `${preview.substring(0, 50)}...` : preview;
    this.progressElements.currentMessage.textContent = truncated;
  }

  /**
   * Updates channel info display and shows/hides appropriate target options.
   */
  private updateChannelInfo(): void {
    const guildId = getGuildIdFromUrl();
    const isDM = guildId === '@me';
    const isServer = Boolean(guildId && guildId !== '@me');

    this.updateTargetOptionVisibility(isDM, isServer);
  }

  /**
   * Updates target option visibility and labels.
   */
  private updateTargetOptionVisibility(isDM: boolean, isServer: boolean): void {
    // Update wizard cards visibility
    const dmCard = this.windowEl?.querySelector('[data-bind="dmCard"]') as HTMLElement | null;
    const serverCard = this.windowEl?.querySelector(
      '[data-bind="serverCard"]',
    ) as HTMLElement | null;

    // Show DM card only in DMs, show Server card only in servers
    if (dmCard) dmCard.style.display = isDM ? 'block' : 'none';
    if (serverCard) serverCard.style.display = isServer ? 'block' : 'none';
  }

  /**
   * Adds a feed entry (batched).
   */
  private addFeedEntry(entry: FeedEntry): void {
    this.feedEntries.push(entry);
    this.pendingFeedEntries.push(entry);

    if (!this.feedUpdateScheduled) {
      this.feedUpdateScheduled = true;
      this.throttledFeedUpdate?.();
    }
  }

  /**
   * Flushes pending feed entries to DOM.
   */
  private flushFeedUpdates(): void {
    this.feedUpdateScheduled = false;

    if (this.pendingFeedEntries.length === 0) return;

    const feedEl = this.windowEl?.querySelector('[data-bind="feed"]');
    if (!feedEl) return;

    // Create fragment for batch insert
    const fragment = document.createDocumentFragment();

    for (const entry of this.pendingFeedEntries) {
      const entryEl = document.createElement('div');
      entryEl.className = `${CSS_PREFIX}-feed-entry ${entry.success ? 'success' : 'error'}`;

      // Truncate and escape content
      let preview = entry.content || '[No content]';
      if (preview.length > MAX_PREVIEW_LENGTH) {
        preview = `${preview.substring(0, MAX_PREVIEW_LENGTH)}...`;
      }

      entryEl.textContent = `${entry.success ? '[OK]' : '[ERR]'} ${preview}`;
      fragment.appendChild(entryEl);
    }

    // Append all at once
    feedEl.appendChild(fragment);

    // Trim old entries
    trimChildren(feedEl as Element, this.options.maxFeedEntries, false);

    // Auto-scroll to bottom
    feedEl.scrollTop = feedEl.scrollHeight;

    this.pendingFeedEntries = [];
  }

  /**
   * Updates a bound element's text content.
   */
  private updateElement(binding: string, value: string): void {
    const el = this.windowEl?.querySelector(`[data-bind="${binding}"]`);
    if (el) {
      el.textContent = value;
    }
  }

  /**
   * Shows an error message.
   */
  private showError(message: string): void {
    this.updateElement('errorMessage', escapeHtml(message));
    this.showScreen('error');
  }

  /**
   * Gets form configuration values.
   */
  private getFormConfig(): DeletionConfig {
    const guildId = getGuildIdFromUrl();
    const channelId = getChannelIdFromUrl();

    const getInput = <T extends HTMLInputElement>(name: string): T | null => {
      return this.windowEl?.querySelector(`[data-input="${name}"]`) as T | null;
    };

    // Use wizard state for target scope
    const targetScope = this.selectedTarget;

    // Get manual channel ID if that option is selected
    const manualChannelIdInput = getInput<HTMLInputElement>('manualChannelId');
    const manualChannelId = manualChannelIdInput?.value?.trim();

    const beforeDateInput = getInput<HTMLInputElement>('beforeDate');
    const afterDateInput = getInput<HTMLInputElement>('afterDate');
    const contentInput = getInput<HTMLInputElement>('contentFilter');
    const patternInput = getInput<HTMLInputElement>('pattern');

    // Use manual channel ID if that scope is selected, otherwise use auto-detected
    // If channels are selected via picker, use the first one as primary (multi-channel handled separately)
    let effectiveChannelId = channelId ?? '';
    if (targetScope === 'manual') {
      if (this.selectedChannels.size > 0) {
        // Use first selected channel as primary
        effectiveChannelId = Array.from(this.selectedChannels)[0] ?? '';
      } else if (manualChannelId) {
        effectiveChannelId = manualChannelId;
      }
    }

    // Get deletion order from radio buttons
    const deletionOrderInput = this.windowEl?.querySelector(
      'input[name="deletionOrder"]:checked',
    ) as HTMLInputElement | null;
    const deletionOrder = (deletionOrderInput?.value as DeletionOrder) || 'newest';

    return {
      targetScope,
      guildId: guildId !== '@me' ? (guildId ?? undefined) : undefined,
      channelId: effectiveChannelId,
      selectedChannelIds: Array.from(this.selectedChannels),
      beforeDate: beforeDateInput?.value ? new Date(beforeDateInput.value) : undefined,
      afterDate: afterDateInput?.value ? new Date(afterDateInput.value) : undefined,
      contentFilter: contentInput?.value || undefined,
      pattern: patternInput?.value || undefined,
      hasLink: this.filterStates.hasLink || false,
      hasFile: this.filterStates.hasFile || false,
      includePinned: this.filterStates.includePinned || false,
      deletionOrder,
    };
  }

  /**
   * Updates the throttle/waiting state in the running screen.
   */
  private updateThrottleState(isThrottled: boolean, currentDelay: number): void {
    const runningScreen = this.windowEl?.querySelector('[data-screen="running"]');
    if (!runningScreen) return;

    let throttleEl = runningScreen.querySelector(`.${CSS_PREFIX}-waiting`) as HTMLElement | null;

    if (isThrottled) {
      if (!throttleEl) {
        throttleEl = document.createElement('div');
        throttleEl.className = `${CSS_PREFIX}-waiting`;
        const eta = this.windowEl?.querySelector('[data-bind="eta"]');
        eta?.insertAdjacentElement('afterend', throttleEl);
      }
      const seconds = Math.round(currentDelay / 1000);
      throttleEl.innerHTML = `
        <div class="${CSS_PREFIX}-spinner"></div>
        <span>Rate limited - waiting ${seconds}s between deletes</span>
      `;
    } else {
      throttleEl?.remove();
    }
  }
}
