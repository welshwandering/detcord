/**
 * Markup for the run: the close-during-run choice, the resume prompt, and the running, complete and error screens.
 *
 * Split out of window-markup.ts so the screens can evolve independently.
 * Every data-action / data-bind / data-input name here is a contract with
 * controller.ts and the tests; add names, do not rename them.
 */

import { CSS_PREFIX } from './constants';

/** HTML for the choice bar shown when the window is closed mid-run. */
export function createRunChoiceHTML(): string {
  return `
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

`;
}

/** HTML for the resume prompt shown at the top of the setup screen. */
export function createResumePromptHTML(): string {
  return `
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

`;
}

/** HTML for the running, complete and error screens. */
export function createRunScreensHTML(): string {
  return `
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
`;
}
