/**
 * Static markup for the Detcord window.
 *
 * Everything in here is trusted, developer-authored HTML. Dynamic values
 * (channel names, message content, error text) are never interpolated here -
 * they are written with `textContent` by the view modules.
 */

import { CSS_PREFIX, SHOW_OLDEST_FIRST } from './constants';

/** Icon shown on the floating trigger button. */
export const TRIGGER_ICON = `
<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
	<path d="M19 4H5c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zm0 14H5V8h14v10zm-9-4h4v2h-4z"/>
</svg>
`;

/** Icon for the window close button. */
export const CLOSE_ICON = `
<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
	<path d="M18.3 5.71a.996.996 0 00-1.41 0L12 10.59 7.11 5.7A.996.996 0 105.7 7.11L10.59 12 5.7 16.89a.996.996 0 101.41 1.41L12 13.41l4.89 4.89a.996.996 0 101.41-1.41L13.41 12l4.89-4.89c.38-.38.38-1.02 0-1.4z"/>
</svg>
`;

/** Icon for the window minimise button. */
export const MINIMIZE_ICON = `
<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
	<path d="M19 13H5v-2h14v2z"/>
</svg>
`;

/**
 * Builds the full window markup.
 *
 * @returns HTML string for the backdrop and window
 */
export function createWindowHTML(): string {
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

	<!-- Choice shown when the window is closed mid-run -->
	<div class="${CSS_PREFIX}-run-choice" data-bind="runChoice">
		<div class="${CSS_PREFIX}-run-choice-text">A deletion is still running.</div>
		<div class="${CSS_PREFIX}-btn-group">
			<button class="${CSS_PREFIX}-btn ${CSS_PREFIX}-btn-secondary" data-action="keepRunning" style="flex: 1;">
				Keep running in background
			</button>
			<button class="${CSS_PREFIX}-btn ${CSS_PREFIX}-btn-danger" data-action="stopRun" style="flex: 1;">
				Stop deletion
			</button>
		</div>
	</div>

	<div class="${CSS_PREFIX}-content">
		<!-- Setup Screen (Wizard Steps) -->
		<div class="${CSS_PREFIX}-screen active" data-screen="setup">

			<!-- Resume prompt for an interrupted session -->
			<div class="${CSS_PREFIX}-resume" data-bind="resumePrompt">
				<div class="${CSS_PREFIX}-resume-text" data-bind="resumeText"></div>
				<div class="${CSS_PREFIX}-btn-group">
					<button class="${CSS_PREFIX}-btn ${CSS_PREFIX}-btn-primary" data-action="resumeSession" style="flex: 1;">
						Resume
					</button>
					<button class="${CSS_PREFIX}-btn ${CSS_PREFIX}-btn-secondary" data-action="discardSession" style="flex: 1;">
						Discard
					</button>
				</div>
			</div>

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
					<div class="${CSS_PREFIX}-card" data-target="specific" data-action="selectTarget">
						<div class="${CSS_PREFIX}-card-icon">🎯</div>
						<div class="${CSS_PREFIX}-card-title">Specific</div>
						<div class="${CSS_PREFIX}-card-desc">Pick channels</div>
					</div>
				</div>

				<div class="${CSS_PREFIX}-channel-picker" data-bind="channelPicker">
					<input type="text" class="${CSS_PREFIX}-channel-search" data-input="channelSearch" placeholder="Search channels...">
					<div class="${CSS_PREFIX}-channel-list" data-bind="channelList"></div>
					<div class="${CSS_PREFIX}-selected-count" data-bind="selectedChannelCount"></div>
				</div>
				<div class="${CSS_PREFIX}-manual-input" data-bind="manualIdContainer">
					<input type="text" data-input="manualChannelId" placeholder="Or enter channel ID manually...">
				</div>

				<div class="${CSS_PREFIX}-inline-error" data-bind="locationError"></div>

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

				<div class="${CSS_PREFIX}-inline-error" data-bind="timeRangeError"></div>

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

				<div class="${CSS_PREFIX}-deletion-order${SHOW_OLDEST_FIRST ? ' visible' : ''}" data-bind="deletionOrderGroup">
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

				<div class="${CSS_PREFIX}-filter-input">
					<label>Regex pattern (optional)</label>
					<input type="text" data-input="pattern" placeholder="e.g. ^gg$">
				</div>

				<div class="${CSS_PREFIX}-inline-error" data-bind="patternError"></div>

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
					<div class="${CSS_PREFIX}-summary-label" data-bind="reviewCountLabel">messages found</div>
					<div class="${CSS_PREFIX}-summary-details" data-bind="reviewDetails">Scanning...</div>
				</div>

				<dl class="${CSS_PREFIX}-review-summary" data-bind="reviewSummary"></dl>

				<div class="${CSS_PREFIX}-preview-list" data-bind="previewList">
					<div class="${CSS_PREFIX}-preview-label">Preview</div>
					<div class="${CSS_PREFIX}-preview-messages" data-bind="previewContent">
						<div class="${CSS_PREFIX}-preview-msg">Scanning messages...</div>
					</div>
				</div>

				<div class="${CSS_PREFIX}-inline-error" data-bind="reviewError"></div>

				<div class="${CSS_PREFIX}-btn-group">
					<button class="${CSS_PREFIX}-btn ${CSS_PREFIX}-btn-ghost" data-action="prevStep">Back</button>
					<button class="${CSS_PREFIX}-btn ${CSS_PREFIX}-btn-sweep" data-action="confirmDelete" data-bind="confirmButton" style="flex: 1;" disabled>
						🧹 Begin Sweep
					</button>
				</div>
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

			<div class="${CSS_PREFIX}-channel-progress" data-bind="channelProgress"></div>

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
						<div class="${CSS_PREFIX}-stat-value" data-bind="skippedCount">0</div>
						<div class="${CSS_PREFIX}-stat-label">Skipped</div>
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
				<div class="${CSS_PREFIX}-complete-icon" data-bind="completeIcon">✨</div>
				<h3 class="${CSS_PREFIX}-complete-title" data-bind="completeTitle">All clean!</h3>
				<div class="${CSS_PREFIX}-complete-stats" data-bind="completeSummary">0 deleted · 0 skipped · 0 failed</div>
				<div class="${CSS_PREFIX}-complete-time" data-bind="completeDuration">in 0s</div>
				<div class="${CSS_PREFIX}-complete-detail" data-bind="completeDetail" style="display: none;"></div>
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
