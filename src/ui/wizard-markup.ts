/**
 * Wizard step markup: target, range, filters and review.
 *
 * Split out of window-markup.ts so the screens can evolve independently.
 * Every data-action / data-bind / data-input name here is a contract with
 * controller.ts and the tests; add names, do not rename them.
 */

import { CSS_PREFIX, SHOW_OLDEST_FIRST } from './constants';

/** HTML for the four wizard steps, placed inside the setup screen. */
export function createWizardStepsHTML(): string {
  return `
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
`;
}
