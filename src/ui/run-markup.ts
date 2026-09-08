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
		<div class="${CSS_PREFIX}-run-choice-text">A deletion is running.</div>
		<div class="${CSS_PREFIX}-btn-group">
			<button class="${CSS_PREFIX}-btn ${CSS_PREFIX}-btn-secondary" data-action="keepRunning" style="flex: 1;">
				Keep running
			</button>
			<button class="${CSS_PREFIX}-btn ${CSS_PREFIX}-btn-danger" data-action="stopRun" style="flex: 1;">
				Stop deleting
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

/**
 * One figure and its label in the running screen's row of counts.
 *
 * @param binding - data-bind name for the value; the row gets `<binding>Figure`
 * @param label - Text under the figure
 * @param hidden - Whether the figure starts hidden
 * @returns HTML for one figure
 */
function figure(binding: string, label: string, hidden = false): string {
  const cls = hidden ? ` ${CSS_PREFIX}-run-figure-hidden` : '';
  return `
					<div class="${CSS_PREFIX}-run-figure${cls}" data-bind="${binding}Figure">
						<span class="${CSS_PREFIX}-run-figure-value" data-bind="${binding}">0</span>
						<span class="${CSS_PREFIX}-run-figure-label">${label}</span>
					</div>`;
}

/** HTML for the running, complete and error screens. */
export function createRunScreensHTML(): string {
  return `
		<!-- Running screen: one instrument, no decoration -->
		<div class="${CSS_PREFIX}-screen" data-screen="running">
			<div class="${CSS_PREFIX}-run">
				<div class="${CSS_PREFIX}-status-message" data-bind="statusMessage" role="status" aria-live="polite">Deleting…</div>
				<div class="${CSS_PREFIX}-channel-progress" data-bind="channelProgress"></div>

				<div class="${CSS_PREFIX}-progress-count ${CSS_PREFIX}-run-count" data-bind="progressCount">0 of 0</div>
				<div class="${CSS_PREFIX}-progress-bar-container ${CSS_PREFIX}-run-track">
					<div class="${CSS_PREFIX}-progress-bar ${CSS_PREFIX}-run-bar" data-bind="progressBar" style="width: 0%"></div>
				</div>

				<div class="${CSS_PREFIX}-run-figures">${figure('deletedCount', 'Deleted')}${figure('skippedCount', 'Skipped')}${figure('failedCount', 'Failed')}${figure('alreadyGone', 'Already gone', true)}
				</div>

				<div class="${CSS_PREFIX}-time-stats ${CSS_PREFIX}-run-times">
					<span class="${CSS_PREFIX}-time-stat">
						<span class="${CSS_PREFIX}-time-label">Elapsed</span>
						<span class="${CSS_PREFIX}-time-value" data-bind="elapsedTime">0s</span>
					</span>
					<span class="${CSS_PREFIX}-time-stat">
						<span class="${CSS_PREFIX}-time-label">Remaining</span>
						<span class="${CSS_PREFIX}-time-value" data-bind="eta">--:--</span>
					</span>
				</div>
			</div>

			<div class="${CSS_PREFIX}-feed ${CSS_PREFIX}-log" data-bind="feed"></div>

			<div class="${CSS_PREFIX}-btn-group">
				<button class="${CSS_PREFIX}-btn ${CSS_PREFIX}-btn-secondary" data-action="pause" style="flex: 1;">
					Pause
				</button>
				<button class="${CSS_PREFIX}-btn ${CSS_PREFIX}-btn-secondary" data-action="stop" style="flex: 1;">
					Stop
				</button>
			</div>
		</div>

		<!-- Complete screen: the run as a receipt -->
		<div class="${CSS_PREFIX}-screen" data-screen="complete">
			<div class="${CSS_PREFIX}-complete">
				<h3 class="${CSS_PREFIX}-complete-title" data-bind="completeTitle">Finished</h3>
				<div class="${CSS_PREFIX}-receipt" data-bind="completeReceipt"></div>
				<div class="${CSS_PREFIX}-complete-detail" data-bind="completeDetail" style="display: none;"></div>
				<div class="${CSS_PREFIX}-receipt-note" data-bind="completeResumeNote" style="display: none;">Resume later</div>
			</div>

			<div class="${CSS_PREFIX}-btn-group">
				<button class="${CSS_PREFIX}-btn ${CSS_PREFIX}-btn-primary" data-action="reset" style="flex: 1;">
					Start another
				</button>
			</div>
		</div>

		<!-- Error screen -->
		<div class="${CSS_PREFIX}-screen" data-screen="error">
			<h3 class="${CSS_PREFIX}-complete-title" data-bind="errorTitle">Something went wrong</h3>
			<div class="${CSS_PREFIX}-error-message" data-bind="errorMessage">
				An error occurred.
			</div>

			<div class="${CSS_PREFIX}-form-group" data-bind="tokenInputContainer">
				<label>Token</label>
				<input type="password" data-input="manualToken" placeholder="Paste your Discord token">
				<p class="${CSS_PREFIX}-field-hint">From DevTools: the Authorization header on any request Discord makes to its API</p>
			</div>
			<div class="${CSS_PREFIX}-btn-group">
				<button class="${CSS_PREFIX}-btn ${CSS_PREFIX}-btn-primary" data-action="useManualToken" style="flex: 1;">
					Use this token
				</button>
				<button class="${CSS_PREFIX}-btn ${CSS_PREFIX}-btn-secondary" data-action="reset" style="flex: 1;">
					Start again
				</button>
			</div>
		</div>
`;
}
