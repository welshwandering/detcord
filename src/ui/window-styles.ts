/**
 * Detcord window styles
 *
 * The complete CSS for the floating wizard window. Extracted from the
 * controller so that the controller module stays readable.
 */

import { CSS_PREFIX, WINDOW_Z_INDEX } from './constants';

/** Full stylesheet for the Detcord window, trigger button and overlays. */
export const WINDOW_STYLES = `
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
.${CSS_PREFIX}-window:has([data-screen="error"].active) .${CSS_PREFIX}-steps {
	display: none;
}

/* Inline validation messages */
.${CSS_PREFIX}-inline-error {
	display: none;
	margin: 8px 0 0;
	padding: 8px 10px;
	border-radius: 6px;
	background: rgba(237, 66, 69, 0.12);
	color: #f0777a;
	font-size: 12px;
	line-height: 1.4;
}

.${CSS_PREFIX}-inline-error.visible {
	display: block;
}

/* Resume prompt */
.${CSS_PREFIX}-resume {
	display: none;
	margin-bottom: 16px;
	padding: 12px;
	border: 1px solid #4752c4;
	border-radius: 8px;
	background: rgba(88, 101, 242, 0.12);
}

.${CSS_PREFIX}-resume.visible {
	display: block;
}

.${CSS_PREFIX}-resume-text {
	margin-bottom: 10px;
	font-size: 13px;
	color: #dbdee1;
}

/* "Still running" choice shown when the window is closed mid-run */
.${CSS_PREFIX}-run-choice {
	display: none;
	padding: 12px 20px;
	border-bottom: 1px solid #1e1f22;
	background: #2b2d31;
}

.${CSS_PREFIX}-run-choice.visible {
	display: block;
}

.${CSS_PREFIX}-run-choice-text {
	margin-bottom: 10px;
	font-size: 13px;
	color: #f2f3f5;
}

.${CSS_PREFIX}-btn-danger {
	background: #da373c;
	color: #fff;
}

.${CSS_PREFIX}-btn-danger:hover {
	background: #a12d31;
}

.${CSS_PREFIX}-btn[disabled] {
	opacity: 0.45;
	cursor: not-allowed;
	filter: grayscale(0.4);
}

/* Multi-channel position */
.${CSS_PREFIX}-channel-progress:empty {
	display: none;
}

.${CSS_PREFIX}-channel-progress {
	margin-bottom: 8px;
	text-align: center;
	font-size: 12px;
	font-weight: 600;
	color: #b5bac1;
}

/* Review summary list */
.${CSS_PREFIX}-review-summary {
	margin: 0 0 12px;
	padding: 10px 12px;
	border-radius: 8px;
	background: #2b2d31;
	font-size: 12px;
}

.${CSS_PREFIX}-review-summary dt {
	color: #949ba4;
	text-transform: uppercase;
	letter-spacing: 0.4px;
	font-size: 10px;
	font-weight: 700;
}

.${CSS_PREFIX}-review-summary dd {
	margin: 2px 0 8px;
	color: #dbdee1;
	word-break: break-word;
}

.${CSS_PREFIX}-review-summary dd:last-child {
	margin-bottom: 0;
}

/* Live feed outcome colours */
.${CSS_PREFIX}-feed-deleted { color: #57f287; }
.${CSS_PREFIX}-feed-already-gone { color: #949ba4; }
.${CSS_PREFIX}-feed-skipped { color: #fee75c; }
.${CSS_PREFIX}-feed-failed { color: #ed4245; }

.${CSS_PREFIX}-complete-detail {
	margin-top: 10px;
	font-size: 12px;
	color: #b5bac1;
	word-break: break-word;
}

/* Deletion order is hidden while the oldest-first flow is redesigned */
.${CSS_PREFIX}-deletion-order {
	display: none;
}

.${CSS_PREFIX}-deletion-order.visible {
	display: block;
}
`;
