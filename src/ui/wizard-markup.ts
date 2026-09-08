/**
 * Wizard step markup: target, range, filters and review.
 *
 * Split out of window-markup.ts so the screens can evolve independently.
 * Every data-action / data-bind / data-input name here is a contract with
 * controller.ts and the tests; add names, do not rename them.
 *
 * Choice rows are real buttons: the controller delegates clicks, so a button
 * gets keyboard operation for free, which a clickable div cannot.
 */

import { CSS_PREFIX, SHOW_OLDEST_FIRST } from './constants';

/** One target or time-range choice: label on the left, hint on the right. */
interface ChoiceRow {
  /** Value written to `data-target` or `data-timerange`. */
  readonly value: string;
  readonly label: string;
  readonly hint: string;
  /** `data-bind` name, for rows the controller shows and hides. */
  readonly bind?: string;
}

const TARGET_ROWS: readonly ChoiceRow[] = [
  { value: 'channel', label: 'Channel', hint: 'Current channel' },
  { value: 'server', label: 'Whole server', hint: 'Every channel you can see', bind: 'serverCard' },
  { value: 'dm', label: 'DM', hint: 'This conversation', bind: 'dmCard' },
  { value: 'specific', label: 'Specific channels', hint: 'Pick channels' },
];

const TIME_RANGE_ROWS: readonly ChoiceRow[] = [
  { value: 'all', label: 'Everything', hint: 'All time' },
  { value: '24h', label: 'Last 24 hours', hint: '24 h' },
  { value: '72h', label: 'Last 3 days', hint: '72 h' },
  { value: '30d', label: 'Last 30 days', hint: '30 d' },
  { value: 'older-30d', label: 'Older than 30 days', hint: 'Over 30 d' },
  { value: 'older-90d', label: 'Older than 90 days', hint: 'Over 90 d' },
  { value: 'custom', label: 'Custom range', hint: 'Pick dates' },
];

/** Element classes for one family of choice rows. */
interface RowClasses {
  readonly row: string;
  readonly label: string;
  readonly hint: string;
}

const TARGET_CLASSES: RowClasses = {
  row: `${CSS_PREFIX}-card`,
  label: `${CSS_PREFIX}-card-title`,
  hint: `${CSS_PREFIX}-card-desc`,
};

const RANGE_CLASSES: RowClasses = {
  row: `${CSS_PREFIX}-option`,
  label: `${CSS_PREFIX}-option-label`,
  hint: `${CSS_PREFIX}-option-hint`,
};

/**
 * Builds one choice row.
 *
 * @param row - The choice to render
 * @param attribute - `data-target` or `data-timerange`
 * @param action - `data-action` the controller dispatches on
 * @param classes - Classes for the row and its two slots
 * @param selected - Whether this row starts selected
 * @returns HTML for the row
 */
function choiceRowHTML(
  row: ChoiceRow,
  attribute: string,
  action: string,
  classes: RowClasses,
  selected: boolean,
): string {
  const bind = row.bind ? ` data-bind="${row.bind}"` : '';
  return `
					<button type="button" class="${classes.row}${selected ? ' selected' : ''}" ${attribute}="${row.value}" data-action="${action}"${bind} role="radio" aria-checked="${selected}">
						<span class="${classes.label}">${row.label}</span>
						<span class="${classes.hint}">${row.hint}</span>
					</button>`;
}

/**
 * Builds a family of choice rows.
 *
 * @param rows - Choices to render, in order
 * @param attribute - `data-target` or `data-timerange`
 * @param action - `data-action` the controller dispatches on
 * @param classes - Classes for the row and its two slots
 * @returns HTML for every row
 */
function choiceRowsHTML(
  rows: readonly ChoiceRow[],
  attribute: string,
  action: string,
  classes: RowClasses,
): string {
  return rows
    .map((row, index) => choiceRowHTML(row, attribute, action, classes, index === 0))
    .join('');
}

/** HTML for the four wizard steps, placed inside the setup screen. */
export function createWizardStepsHTML(): string {
  const targets = choiceRowsHTML(TARGET_ROWS, 'data-target', 'selectTarget', TARGET_CLASSES);
  const ranges = choiceRowsHTML(
    TIME_RANGE_ROWS,
    'data-timerange',
    'selectTimeRange',
    RANGE_CLASSES,
  );

  return `
			<div class="${CSS_PREFIX}-wizard-summary" data-bind="wizardSummary"></div>

			<!-- Step 1: Location -->
			<div class="${CSS_PREFIX}-wizard-step active" data-wizard-step="location">
				<h3 class="${CSS_PREFIX}-step-title">Target</h3>

				<div class="${CSS_PREFIX}-cards" role="radiogroup" aria-label="Where to delete from">${targets}
				</div>

				<div class="${CSS_PREFIX}-channel-picker" data-bind="channelPicker">
					<input type="text" class="${CSS_PREFIX}-channel-search" data-input="channelSearch" placeholder="Search channels" aria-label="Search channels">
					<div class="${CSS_PREFIX}-channel-list" data-bind="channelList"></div>
					<div class="${CSS_PREFIX}-selected-count" data-bind="selectedChannelCount"></div>
				</div>
				<div class="${CSS_PREFIX}-manual-input" data-bind="manualIdContainer">
					<input type="text" data-input="manualChannelId" placeholder="Or enter a channel ID" aria-label="Channel ID">
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
				<h3 class="${CSS_PREFIX}-step-title">Range</h3>

				<div class="${CSS_PREFIX}-options" role="radiogroup" aria-label="How far back to go">${ranges}
				</div>

				<div class="${CSS_PREFIX}-date-range" data-bind="dateRangeContainer">
					<input type="date" data-input="afterDate" aria-label="From date">
					<input type="date" data-input="beforeDate" aria-label="To date">
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
				<h3 class="${CSS_PREFIX}-step-title">Filters</h3>

				<div class="${CSS_PREFIX}-toggles">
					<div class="${CSS_PREFIX}-toggle-group-label">Only messages with</div>
					<div class="${CSS_PREFIX}-toggle">
						<span class="${CSS_PREFIX}-toggle-label">Links</span>
						<div class="${CSS_PREFIX}-toggle-switch" data-toggle="hasLink" data-action="toggleFilter"></div>
					</div>
					<div class="${CSS_PREFIX}-toggle">
						<span class="${CSS_PREFIX}-toggle-label">Attachments</span>
						<div class="${CSS_PREFIX}-toggle-switch" data-toggle="hasFile" data-action="toggleFilter"></div>
					</div>
				</div>

				<div class="${CSS_PREFIX}-toggles">
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
					<label for="${CSS_PREFIX}-content-filter">Text filter (optional)</label>
					<input type="text" id="${CSS_PREFIX}-content-filter" data-input="contentFilter" placeholder="Messages containing">
				</div>

				<div class="${CSS_PREFIX}-filter-input">
					<label for="${CSS_PREFIX}-pattern-filter">Regex pattern (optional)</label>
					<input type="text" id="${CSS_PREFIX}-pattern-filter" data-input="pattern" placeholder="e.g. ^gg$">
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
				<h3 class="${CSS_PREFIX}-step-title">Review</h3>

				<div class="${CSS_PREFIX}-summary" data-bind="reviewSummary">
					<div class="${CSS_PREFIX}-summary-count" data-bind="reviewCount">&mdash;</div>
					<div class="${CSS_PREFIX}-summary-label" data-bind="reviewCountLabel">messages will be deleted</div>
					<div class="${CSS_PREFIX}-summary-details" data-bind="reviewDetails"></div>
					<dl class="${CSS_PREFIX}-review-summary" data-bind="reviewRows"></dl>
				</div>

				<div class="${CSS_PREFIX}-preview-list" data-bind="previewList">
					<div class="${CSS_PREFIX}-preview-label">Preview</div>
					<div class="${CSS_PREFIX}-preview-messages" data-bind="previewContent">
						<div class="${CSS_PREFIX}-preview-msg">Counting messages&hellip;</div>
					</div>
				</div>

				<div class="${CSS_PREFIX}-inline-error" data-bind="reviewError"></div>

				<div class="${CSS_PREFIX}-btn-group">
					<button class="${CSS_PREFIX}-btn ${CSS_PREFIX}-btn-ghost" data-action="prevStep">Back</button>
					<button class="${CSS_PREFIX}-btn ${CSS_PREFIX}-btn-sweep" data-action="confirmDelete" data-bind="confirmButton" style="flex: 1;" disabled>
						<span data-bind="confirmLabel">Delete messages</span>
					</button>
				</div>
			</div>
`;
}
