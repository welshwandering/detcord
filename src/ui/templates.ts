/**
 * UI Templates Module for Detcord
 *
 * High-performance HTML templates and DOM creation utilities.
 * Uses template literals for static content and safe DOM APIs for dynamic content.
 */

/**
 * SVG icon definitions
 * Optimized paths with minimal nodes
 */
export const ICONS: Record<string, string> = {
  bomb: `<svg viewBox="0 0 24 24" width="24" height="24" fill="currentColor" aria-hidden="true">
		<path d="M11.25 6a.75.75 0 0 1 .75-.75h2.25V3a.75.75 0 0 1 1.5 0v2.25H18a.75.75 0 0 1 0 1.5h-2.25V9a.75.75 0 0 1-1.5 0V6.75H12a.75.75 0 0 1-.75-.75Z"/>
		<path d="M9 8.5a6.5 6.5 0 1 0 0 13 6.5 6.5 0 0 0 0-13ZM1 15a8 8 0 1 1 16 0 8 8 0 0 1-16 0Z"/>
		<circle cx="9" cy="15" r="3"/>
	</svg>`,

  close: `<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true">
		<path d="M18 6 6 18M6 6l12 12"/>
	</svg>`,

  minimize: `<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true">
		<path d="M5 12h14"/>
	</svg>`,

  check: `<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
		<path d="M20 6 9 17l-5-5"/>
	</svg>`,

  pause: `<svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor" aria-hidden="true">
		<rect x="6" y="4" width="4" height="16" rx="1"/>
		<rect x="14" y="4" width="4" height="16" rx="1"/>
	</svg>`,

  play: `<svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor" aria-hidden="true">
		<path d="M8 5.14v13.72a1 1 0 0 0 1.5.86l11-6.86a1 1 0 0 0 0-1.72l-11-6.86a1 1 0 0 0-1.5.86Z"/>
	</svg>`,

  channel: `<svg viewBox="0 0 24 24" width="24" height="24" fill="currentColor" aria-hidden="true">
		<path d="M5.88 21 7.88 15H3l.72-2h5l1.5-5H5l.72-2h5.5l2-7h2l-2 7h5l2-7h2l-2 7h4l-.72 2h-5l-1.5 5h5l-.72 2h-5.5l-2 7h-2l2-7h-5l-2 7h-2Z"/>
	</svg>`,

  server: `<svg viewBox="0 0 24 24" width="24" height="24" fill="currentColor" aria-hidden="true">
		<path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2Zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8Zm-5-9a2 2 0 1 1 4 0 2 2 0 0 1-4 0Zm6 0a2 2 0 1 1 4 0 2 2 0 0 1-4 0Zm-3 4a5 5 0 0 0 4 0"/>
	</svg>`,

  dm: `<svg viewBox="0 0 24 24" width="24" height="24" fill="currentColor" aria-hidden="true">
		<path d="M12 12a5 5 0 1 0 0-10 5 5 0 0 0 0 10Zm0 2c-5.33 0-8 2.67-8 4v2h16v-2c0-1.33-2.67-4-8-4Z"/>
	</svg>`,

  chevronRight: `<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
		<path d="m9 18 6-6-6-6"/>
	</svg>`,

  chevronLeft: `<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
		<path d="m15 18-6-6 6-6"/>
	</svg>`,

  warning: `<svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor" aria-hidden="true">
		<path d="M12 2L1 21h22L12 2Zm0 4 7.53 13H4.47L12 6Zm-1 5v4h2v-4h-2Zm0 6v2h2v-2h-2Z"/>
	</svg>`,

  celebration: `<svg viewBox="0 0 24 24" width="48" height="48" fill="currentColor" aria-hidden="true">
		<path d="m2 22 1-1h4l1 1H2Zm4-2-2-17 14 14-12 3Zm11.5-7.5L19 11l2.5 1.5L20 15l1.5 2.5L19 19l-1.5-2.5L16 18l-1.5-2.5L16 13l1.5 2.5ZM19 3l1.5 2.5L23 4l-1.5 2.5L23 9l-2.5-1.5L19 10l-1.5-2.5L15 9l1.5-2.5L15 4l2.5 1.5L19 3Z"/>
	</svg>`,
};

/**
 * Toolbar button template
 * Floating action button to open the Detcord window
 */
export const BUTTON_TEMPLATE = `
<button
	type="button"
	id="detcord-trigger"
	class="detcord-trigger"
	aria-label="Open Detcord message deletion tool"
	title="Detcord"
>
	${ICONS.bomb}
</button>
`;

/**
 * Main window template with wizard-based screens
 * Uses semantic HTML with ARIA attributes for accessibility
 */
export const WINDOW_TEMPLATE = `
<div
	class="detcord-window"
	role="dialog"
	aria-labelledby="detcord-title"
	aria-modal="true"
	data-screen="1"
>
	<!-- Hidden data inputs -->
	<input type="hidden" id="detcord-author-id" data-field="authorId" />
	<input type="hidden" id="detcord-guild-id" data-field="guildId" />
	<input type="hidden" id="detcord-channel-id" data-field="channelId" />
	<input type="hidden" id="detcord-token" data-field="token" />

	<!-- Header -->
	<header class="detcord-header" data-draggable="true">
		<div class="detcord-header-title">
			<span class="detcord-icon" aria-hidden="true">${ICONS.bomb}</span>
			<h1 id="detcord-title" class="detcord-title">Detcord</h1>
		</div>
		<div class="detcord-header-controls">
			<button
				type="button"
				class="detcord-btn-icon"
				data-action="minimize"
				aria-label="Minimize window"
				tabindex="0"
			>
				${ICONS.minimize}
			</button>
			<button
				type="button"
				class="detcord-btn-icon detcord-btn-close"
				data-action="close"
				aria-label="Close window"
				tabindex="0"
			>
				${ICONS.close}
			</button>
		</div>
	</header>

	<!-- Progress indicator -->
	<nav class="detcord-progress-nav" aria-label="Wizard progress">
		<ol class="detcord-steps">
			<li class="detcord-step detcord-step-active" data-step="1" aria-current="step">
				<span class="detcord-step-number">1</span>
				<span class="detcord-step-label">Target</span>
			</li>
			<li class="detcord-step" data-step="2">
				<span class="detcord-step-number">2</span>
				<span class="detcord-step-label">Filters</span>
			</li>
			<li class="detcord-step" data-step="3">
				<span class="detcord-step-number">3</span>
				<span class="detcord-step-label">Preview</span>
			</li>
			<li class="detcord-step" data-step="4">
				<span class="detcord-step-number">4</span>
				<span class="detcord-step-label">Progress</span>
			</li>
			<li class="detcord-step" data-step="5">
				<span class="detcord-step-number">${ICONS.check}</span>
				<span class="detcord-step-label">Done</span>
			</li>
		</ol>
	</nav>

	<!-- Screen 1: Target Selection -->
	<section
		class="detcord-screen detcord-screen-active"
		data-screen="1"
		aria-labelledby="screen1-title"
	>
		<h2 id="screen1-title" class="detcord-screen-title">Select Target</h2>
		<p class="detcord-screen-desc">Choose where to delete your messages from.</p>

		<div class="detcord-cards" role="radiogroup" aria-label="Deletion target">
			<button
				type="button"
				class="detcord-card"
				data-target="channel"
				role="radio"
				aria-checked="false"
				tabindex="0"
			>
				<span class="detcord-card-icon">${ICONS.channel}</span>
				<span class="detcord-card-title">Current Channel</span>
				<span class="detcord-card-desc">Delete messages from this channel only</span>
			</button>

			<button
				type="button"
				class="detcord-card"
				data-target="server"
				role="radio"
				aria-checked="false"
				tabindex="0"
			>
				<span class="detcord-card-icon">${ICONS.server}</span>
				<span class="detcord-card-title">Entire Server</span>
				<span class="detcord-card-desc">Delete messages from all channels in this server</span>
			</button>

			<button
				type="button"
				class="detcord-card"
				data-target="dm"
				role="radio"
				aria-checked="false"
				tabindex="0"
			>
				<span class="detcord-card-icon">${ICONS.dm}</span>
				<span class="detcord-card-title">DM Channel</span>
				<span class="detcord-card-desc">Delete messages from this DM conversation</span>
			</button>
		</div>

		<footer class="detcord-screen-footer">
			<button
				type="button"
				class="detcord-btn detcord-btn-primary"
				data-action="next"
				disabled
				aria-disabled="true"
			>
				Next ${ICONS.chevronRight}
			</button>
		</footer>
	</section>

	<!-- Screen 2: Filters -->
	<section
		class="detcord-screen"
		data-screen="2"
		aria-labelledby="screen2-title"
		hidden
	>
		<h2 id="screen2-title" class="detcord-screen-title">Filter Messages</h2>
		<p class="detcord-screen-desc">Narrow down which messages to delete.</p>

		<form class="detcord-form" data-form="filters">
			<fieldset class="detcord-fieldset">
				<legend class="detcord-legend">Date Range</legend>
				<div class="detcord-field-row">
					<div class="detcord-field">
						<label for="filter-date-from" class="detcord-label">From</label>
						<input
							type="date"
							id="filter-date-from"
							class="detcord-input"
							data-filter="dateFrom"
						/>
					</div>
					<div class="detcord-field">
						<label for="filter-date-to" class="detcord-label">To</label>
						<input
							type="date"
							id="filter-date-to"
							class="detcord-input"
							data-filter="dateTo"
						/>
					</div>
				</div>
			</fieldset>

			<fieldset class="detcord-fieldset">
				<legend class="detcord-legend">Content</legend>
				<div class="detcord-field">
					<label for="filter-content" class="detcord-label">Contains text</label>
					<input
						type="text"
						id="filter-content"
						class="detcord-input"
						placeholder="Search term..."
						data-filter="content"
					/>
				</div>
			</fieldset>

			<fieldset class="detcord-fieldset">
				<legend class="detcord-legend">Message Type</legend>
				<div class="detcord-checkbox-group">
					<label class="detcord-checkbox">
						<input type="checkbox" data-filter="hasLink" />
						<span class="detcord-checkbox-box"></span>
						<span class="detcord-checkbox-label">Has link</span>
					</label>
					<label class="detcord-checkbox">
						<input type="checkbox" data-filter="hasFile" />
						<span class="detcord-checkbox-box"></span>
						<span class="detcord-checkbox-label">Has attachment</span>
					</label>
					<label class="detcord-checkbox">
						<input type="checkbox" data-filter="includePinned" />
						<span class="detcord-checkbox-box"></span>
						<span class="detcord-checkbox-label">Include pinned messages</span>
					</label>
				</div>
			</fieldset>

			<details class="detcord-advanced">
				<summary class="detcord-advanced-summary">Advanced Options</summary>
				<div class="detcord-advanced-content">
					<fieldset class="detcord-fieldset">
						<legend class="detcord-legend">Deletion Order</legend>
						<div class="detcord-radio-group">
							<label class="detcord-radio">
								<input type="radio" name="deletionOrder" value="newest" data-filter="deletionOrder" checked />
								<span class="detcord-radio-box"></span>
								<span class="detcord-radio-label">Newest first</span>
							</label>
							<label class="detcord-radio">
								<input type="radio" name="deletionOrder" value="oldest" data-filter="deletionOrder" />
								<span class="detcord-radio-box"></span>
								<span class="detcord-radio-label">Oldest first</span>
							</label>
						</div>
					</fieldset>
					<div class="detcord-field">
						<label for="filter-pattern" class="detcord-label">
							Regex pattern
							<span class="detcord-label-hint">(advanced)</span>
						</label>
						<input
							type="text"
							id="filter-pattern"
							class="detcord-input detcord-input-mono"
							placeholder="^prefix.*"
							data-filter="pattern"
						/>
					</div>
					<div class="detcord-field-row">
						<div class="detcord-field">
							<label for="filter-search-delay" class="detcord-label">Search delay (ms)</label>
							<input
								type="number"
								id="filter-search-delay"
								class="detcord-input"
								value="10000"
								min="1000"
								max="60000"
								step="1000"
								data-filter="searchDelay"
							/>
						</div>
						<div class="detcord-field">
							<label for="filter-delete-delay" class="detcord-label">Delete delay (ms)</label>
							<input
								type="number"
								id="filter-delete-delay"
								class="detcord-input"
								value="1000"
								min="200"
								max="10000"
								step="100"
								data-filter="deleteDelay"
							/>
						</div>
					</div>
				</div>
			</details>
		</form>

		<footer class="detcord-screen-footer">
			<button type="button" class="detcord-btn" data-action="back">
				${ICONS.chevronLeft} Back
			</button>
			<button type="button" class="detcord-btn detcord-btn-primary" data-action="next">
				Next ${ICONS.chevronRight}
			</button>
		</footer>
	</section>

	<!-- Screen 3: Preview -->
	<section
		class="detcord-screen"
		data-screen="3"
		aria-labelledby="screen3-title"
		hidden
	>
		<h2 id="screen3-title" class="detcord-screen-title">Preview</h2>
		<p class="detcord-screen-desc">Review before starting deletion.</p>

		<div class="detcord-preview">
			<div class="detcord-preview-stats">
				<div class="detcord-stat">
					<span class="detcord-stat-value" data-stat="totalFound">--</span>
					<span class="detcord-stat-label">Messages found</span>
				</div>
				<div class="detcord-stat">
					<span class="detcord-stat-value" data-stat="estimatedTime">--</span>
					<span class="detcord-stat-label">Estimated time</span>
				</div>
			</div>

			<div class="detcord-preview-messages" data-container="sampleMessages">
				<p class="detcord-preview-loading" data-loading="preview">Searching for messages...</p>
			</div>

			<div class="detcord-warning" role="alert">
				${ICONS.warning}
				<span>This action cannot be undone. Messages will be permanently deleted.</span>
			</div>
		</div>

		<footer class="detcord-screen-footer">
			<button type="button" class="detcord-btn" data-action="back">
				${ICONS.chevronLeft} Back
			</button>
			<button
				type="button"
				class="detcord-btn detcord-btn-danger"
				data-action="start"
				disabled
				aria-disabled="true"
			>
				${ICONS.bomb} Start Deletion
			</button>
		</footer>
	</section>

	<!-- Screen 4: Progress -->
	<section
		class="detcord-screen"
		data-screen="4"
		aria-labelledby="screen4-title"
		hidden
	>
		<h2 id="screen4-title" class="detcord-screen-title">Deleting Messages</h2>

		<div class="detcord-progress-container">
			<div class="detcord-progress-ring" role="progressbar" aria-valuenow="0" aria-valuemin="0" aria-valuemax="100">
				<svg viewBox="0 0 120 120" class="detcord-progress-svg">
					<circle
						class="detcord-progress-bg"
						cx="60"
						cy="60"
						r="54"
						fill="none"
						stroke-width="8"
					/>
					<circle
						class="detcord-progress-fill"
						cx="60"
						cy="60"
						r="54"
						fill="none"
						stroke-width="8"
						stroke-dasharray="339.292"
						stroke-dashoffset="339.292"
						data-progress="ring"
					/>
				</svg>
				<div class="detcord-progress-center">
					<span class="detcord-progress-percent" data-stat="percent">0%</span>
					<span class="detcord-progress-detail" data-stat="progressDetail">0 / 0</span>
				</div>
			</div>

			<div class="detcord-progress-stats">
				<div class="detcord-stat detcord-stat-inline">
					<span class="detcord-stat-label">Deleted:</span>
					<span class="detcord-stat-value" data-stat="deleted">0</span>
				</div>
				<div class="detcord-stat detcord-stat-inline">
					<span class="detcord-stat-label">Failed:</span>
					<span class="detcord-stat-value" data-stat="failed">0</span>
				</div>
				<div class="detcord-stat detcord-stat-inline">
					<span class="detcord-stat-label">Skipped:</span>
					<span class="detcord-stat-value" data-stat="skipped">0</span>
				</div>
				<div class="detcord-stat detcord-stat-inline">
					<span class="detcord-stat-label">Time remaining:</span>
					<span class="detcord-stat-value" data-stat="timeRemaining">--</span>
				</div>
			</div>
		</div>

		<div class="detcord-feed" aria-live="polite" aria-label="Deletion activity feed">
			<ul class="detcord-feed-list" data-container="feed"></ul>
		</div>

		<footer class="detcord-screen-footer">
			<button type="button" class="detcord-btn" data-action="pause" data-paused="false">
				${ICONS.pause} <span data-label="pauseBtn">Pause</span>
			</button>
			<button type="button" class="detcord-btn detcord-btn-danger" data-action="stop">
				Stop
			</button>
		</footer>
	</section>

	<!-- Screen 5: Complete -->
	<section
		class="detcord-screen"
		data-screen="5"
		aria-labelledby="screen5-title"
		hidden
	>
		<h2 id="screen5-title" class="detcord-screen-title">Complete!</h2>

		<div class="detcord-complete">
			<div class="detcord-complete-icon" aria-hidden="true">
				${ICONS.celebration}
			</div>

			<div class="detcord-complete-stats">
				<div class="detcord-stat">
					<span class="detcord-stat-value" data-stat="finalDeleted">0</span>
					<span class="detcord-stat-label">Messages deleted</span>
				</div>
				<div class="detcord-stat">
					<span class="detcord-stat-value" data-stat="finalTime">0s</span>
					<span class="detcord-stat-label">Time taken</span>
				</div>
			</div>

			<p class="detcord-complete-message" data-container="completeMessage">
				Your messages have been successfully deleted.
			</p>
		</div>

		<footer class="detcord-screen-footer">
			<button type="button" class="detcord-btn" data-action="restart">
				Delete More
			</button>
			<button type="button" class="detcord-btn detcord-btn-primary" data-action="close">
				Done
			</button>
		</footer>
	</section>
</div>
`;

/**
 * Create a DOM element safely with attributes and children
 * More efficient than innerHTML for dynamic content
 *
 * @param tag - HTML tag name
 * @param attrs - Optional attributes to set
 * @param children - Optional children (strings are escaped, Nodes are appended)
 * @returns The created element
 */
export function createElement<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  attrs?: Record<string, string>,
  children?: (string | Node)[],
): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);

  if (attrs) {
    for (const [key, value] of Object.entries(attrs)) {
      if (key === 'class') {
        el.className = value;
      } else if (key.startsWith('data-')) {
        el.dataset[key.slice(5)] = value;
      } else if (key.startsWith('aria-')) {
        el.setAttribute(key, value);
      } else {
        el.setAttribute(key, value);
      }
    }
  }

  if (children) {
    for (const child of children) {
      if (typeof child === 'string') {
        el.appendChild(document.createTextNode(child));
      } else {
        el.appendChild(child);
      }
    }
  }

  return el;
}

/**
 * Create a feed item element for the activity log
 * Uses DOM APIs for dynamic content safety
 *
 * @param content - Text content of the message
 * @param timestamp - ISO timestamp string
 * @param type - Type of feed item for styling
 * @returns List item element
 */
export function createFeedItem(
  content: string,
  timestamp: string,
  type: 'deleted' | 'skipped' | 'error' | 'info' = 'deleted',
): HTMLLIElement {
  const time = new Date(timestamp);
  const timeStr = time.toLocaleTimeString();

  return createElement('li', { class: `detcord-feed-item detcord-feed-item-${type}` }, [
    createElement('time', { datetime: timestamp, class: 'detcord-feed-time' }, [timeStr]),
    createElement('span', { class: 'detcord-feed-content' }, [content]),
  ]);
}

/**
 * Create a preview message element
 * Escapes content for safe display
 *
 * @param content - Message content (will be truncated)
 * @param timestamp - ISO timestamp string
 * @param channelName - Optional channel name
 * @returns Preview item element
 */
export function createPreviewItem(
  content: string,
  timestamp: string,
  channelName?: string,
): HTMLElement {
  const date = new Date(timestamp);
  const dateStr = date.toLocaleDateString();
  const truncated = content.length > 100 ? `${content.slice(0, 100)}...` : content;

  const children: (string | Node)[] = [
    createElement('span', { class: 'detcord-preview-content' }, [truncated || '[No content]']),
    createElement('span', { class: 'detcord-preview-meta' }, [
      channelName ? `${channelName} - ${dateStr}` : dateStr,
    ]),
  ];

  return createElement('div', { class: 'detcord-preview-item' }, children);
}

/**
 * Parse an HTML string into a DocumentFragment
 * Use only for trusted static templates, not user content
 *
 * @param html - HTML string to parse
 * @returns DocumentFragment containing parsed nodes
 */
export function parseTemplate(html: string): DocumentFragment {
  const template = document.createElement('template');
  template.innerHTML = html.trim();
  return template.content;
}

/**
 * Update progress ring stroke offset based on percentage
 * Optimized for frequent updates
 *
 * @param ring - The progress ring circle element
 * @param percent - Progress percentage (0-100)
 */
export function updateProgressRing(ring: SVGCircleElement, percent: number): void {
  const circumference = 339.292; // 2 * PI * 54 (radius)
  const offset = circumference - (percent / 100) * circumference;
  ring.style.strokeDashoffset = String(offset);
}

/**
 * Message data for preview display
 */
export interface PreviewMessage {
  id: string;
  content: string;
  timestamp: string;
  authorName?: string;
}

/**
 * Creates the preview screen content with sample messages.
 * This screen is shown before deletion starts for user confirmation.
 *
 * @param totalCount - Total number of messages found
 * @param estimatedTime - Estimated deletion time string
 * @param sampleMessages - Sample messages to display (first 3-5)
 * @returns DocumentFragment containing the preview screen content
 */
export function createPreviewScreenContent(
  totalCount: number,
  estimatedTime: string,
  sampleMessages: PreviewMessage[],
): DocumentFragment {
  const fragment = document.createDocumentFragment();

  // Summary section
  const summary = createElement('div', { class: 'preview-summary' }, []);
  const countEl = createElement('div', { class: 'preview-count' }, [String(totalCount)]);
  const countLabel = createElement('div', { class: 'preview-count-label' }, [
    'messages will be deleted',
  ]);
  const estimate = createElement('div', { class: 'preview-estimate' }, [
    'Estimated time: ',
    createElement('strong', {}, [estimatedTime]),
  ]);
  summary.appendChild(countEl);
  summary.appendChild(countLabel);
  summary.appendChild(estimate);
  fragment.appendChild(summary);

  // Sample messages section (if any)
  if (sampleMessages.length > 0) {
    const sampleHeader = createElement('h3', { class: 'screen-title text-small mt-16 mb-8' }, [
      'Sample Messages',
    ]);
    fragment.appendChild(sampleHeader);

    const messagesContainer = createElement('div', { class: 'preview-messages' }, []);

    for (const msg of sampleMessages.slice(0, 5)) {
      const msgEl = createPreviewMessageElement(msg);
      messagesContainer.appendChild(msgEl);
    }

    fragment.appendChild(messagesContainer);
  }

  // Warning banner
  const warning = createElement('div', { class: 'warning-banner mt-16' }, []);
  warning.innerHTML = `${ICONS.warning}`;
  warning.appendChild(
    createElement('span', { class: 'warning-banner-text' }, [
      'This action cannot be undone. Messages will be permanently deleted.',
    ]),
  );
  fragment.appendChild(warning);

  return fragment;
}

/**
 * Creates a preview message element for display
 *
 * @param message - The message data to display
 * @returns HTMLElement for the preview message
 */
function createPreviewMessageElement(message: PreviewMessage): HTMLElement {
  const date = new Date(message.timestamp);
  const dateStr = date.toLocaleDateString();
  const timeStr = date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  const truncated =
    message.content.length > 100 ? `${message.content.slice(0, 100)}...` : message.content;

  const messageEl = createElement('div', { class: 'preview-message' }, []);

  // Avatar placeholder
  const avatar = createElement('div', { class: 'preview-avatar' }, []);
  messageEl.appendChild(avatar);

  // Message meta and content
  const meta = createElement('div', { class: 'preview-meta' }, []);

  const authorLine = createElement('span', {}, []);
  if (message.authorName) {
    const authorSpan = createElement('span', { class: 'preview-author' }, [message.authorName]);
    authorLine.appendChild(authorSpan);
  }
  const timestamp = createElement('span', { class: 'preview-timestamp' }, [
    `${dateStr} ${timeStr}`,
  ]);
  authorLine.appendChild(timestamp);
  meta.appendChild(authorLine);

  const content = createElement('div', { class: 'preview-content' }, [truncated || '[No content]']);
  meta.appendChild(content);

  messageEl.appendChild(meta);

  return messageEl;
}

/**
 * Creates a countdown overlay element
 *
 * @returns HTMLElement for the countdown overlay
 */
export function createCountdownOverlay(): HTMLElement {
  return createElement('div', { class: 'countdown-overlay' }, []);
}

/**
 * Creates a status message element for the running screen
 *
 * @param initialMessage - Initial message to display
 * @returns HTMLElement for the status message
 */
export function createStatusMessageElement(initialMessage = ''): HTMLElement {
  return createElement('div', { class: 'status-message' }, [initialMessage]);
}

/**
 * Creates a confetti container element
 *
 * @returns HTMLElement for the confetti container
 */
export function createConfettiContainer(): HTMLElement {
  return createElement('div', { class: 'confetti-container' }, []);
}
