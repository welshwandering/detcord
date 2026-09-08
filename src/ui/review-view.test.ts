import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { DiscordMessage } from './ports';
import { ReviewView } from './review-view';
import { buildRunConfig, type RunConfig, type RunConfigInput } from './run-config';
import type { PreviewSummary } from './runner';
import { createWindowHTML } from './window-markup';

const CHANNEL_A = '111111111111111111';
const CHANNEL_B = '222222222222222222';
const GUILD = '333333333333333333';

function config(overrides: Partial<RunConfigInput> = {}): RunConfig {
  const result = buildRunConfig({
    authorId: 'author-1',
    scope: 'channel',
    guildId: GUILD,
    urlChannelId: CHANNEL_A,
    routePath: `/channels/${GUILD}/${CHANNEL_A}`,
    selectedChannelIds: [],
    manualChannelId: '',
    after: null,
    before: null,
    timeRangeLabel: 'Everything',
    content: '',
    pattern: '',
    hasLink: false,
    hasFile: false,
    includePinned: false,
    deletionOrder: 'newest',
    ...overrides,
  });
  if (!result.ok) {
    throw new Error(`expected ok, got: ${result.error}`);
  }
  return result.config;
}

function message(id: string, timestamp: string, content = `content ${id}`): DiscordMessage {
  return {
    id,
    channel_id: CHANNEL_A,
    content,
    timestamp,
    type: 0,
    pinned: false,
    author: { id: 'author-1', username: 'me', discriminator: '0' },
  } as unknown as DiscordMessage;
}

function summary(overrides: Partial<PreviewSummary> = {}): PreviewSummary {
  return {
    totalCount: 12,
    filtersApplied: false,
    estimatedTimeMs: 90_000,
    sampleMessages: [],
    channelsCounted: 1,
    channelCount: 1,
    ...overrides,
  };
}

describe('ReviewView', () => {
  let root: HTMLElement;
  let view: ReviewView;

  beforeEach(() => {
    root = document.createElement('div');
    root.innerHTML = createWindowHTML();
    document.body.appendChild(root);
    view = new ReviewView(root);
  });

  afterEach(() => {
    document.body.innerHTML = '';
  });

  function text(binding: string): string {
    return root.querySelector(`[data-bind="${binding}"]`)?.textContent ?? '';
  }

  function rows(): Array<[string, string]> {
    const list = root.querySelector('[data-bind="reviewRows"]') as HTMLElement;
    const terms = [...list.querySelectorAll('dt')].map((el) => el.textContent ?? '');
    const details = [...list.querySelectorAll('dd')].map((el) => el.textContent ?? '');
    return terms.map((term, index) => [term, details[index] ?? '']);
  }

  function rowValue(label: string): string | undefined {
    return rows().find(([term]) => term === label)?.[1];
  }

  describe('the label line', () => {
    it('says what will be deleted from where', () => {
      view.renderSummary(config());
      expect(text('reviewCountLabel')).toBe(
        `messages will be deleted from Channel ${CHANNEL_A}, all time, pinned kept`,
      );
    });

    it('names the channel when the picker rendered its name', () => {
      const list = root.querySelector('[data-bind="channelList"]') as HTMLElement;
      list.innerHTML = `<div data-channel-id="${CHANNEL_A}"><span class="detcord-channel-name">general</span></div>`;
      view.renderSummary(config());
      expect(text('reviewCountLabel')).toContain('Channel #general');
    });

    it('names the chosen preset rather than the instants behind it', () => {
      view.renderSummary(config({ after: new Date(2024, 0, 2), timeRangeLabel: 'Last 24 hours' }));
      expect(text('reviewCountLabel')).toContain('Last 24 hours');
    });

    it('lists the filters that are on', () => {
      view.renderSummary(config({ hasLink: true, includePinned: true }));
      expect(text('reviewCountLabel')).toContain('with links, pinned included');
    });
  });

  describe('the receipt rows', () => {
    it('shows the cutoff as soon as a config is reviewed', () => {
      const captured = new Date(2024, 4, 6, 7, 8);
      view.renderSummary(config({ newestAllowed: captured }));
      expect(rowValue('Messages up to')).toContain(captured.toLocaleDateString());
    });

    it('has nothing to report before a preview lands', () => {
      view.renderSummary(config());
      expect(rowValue('Newest')).toBe('\u2014');
      expect(rowValue('Oldest')).toBe('\u2014');
      expect(rowValue('Estimated time')).toBe('\u2014');
    });

    it('reports the two ends of the preview sample', () => {
      view.renderSummary(config());
      const oldest = new Date(2024, 0, 2, 3, 4);
      const newest = new Date(2024, 5, 7, 8, 9);
      view.renderPreview(
        summary({
          sampleMessages: [
            message('a', new Date(2024, 2, 3).toISOString()),
            message('b', newest.toISOString()),
            message('c', oldest.toISOString()),
          ],
        }),
      );
      expect(rowValue('Newest')).toContain(newest.toLocaleDateString());
      expect(rowValue('Oldest')).toContain(oldest.toLocaleDateString());
    });

    it('leaves the ends blank when the sample is empty or unparseable', () => {
      view.renderSummary(config());
      view.renderPreview(summary({ sampleMessages: [message('a', 'not-a-date')] }));
      expect(rowValue('Newest')).toBe('\u2014');
      expect(rowValue('Oldest')).toBe('\u2014');
    });

    it('warns that filters may skip messages only when they were applied', () => {
      view.renderSummary(config());
      view.renderPreview(summary());
      expect(rowValue('Skipped by filters')).toBe('none');
      view.renderPreview(summary({ filtersApplied: true }));
      expect(rowValue('Skipped by filters')).toBe('some may be skipped');
    });

    it('states the estimate', () => {
      view.renderSummary(config());
      view.renderPreview(summary({ estimatedTimeMs: 90_000 }));
      expect(rowValue('Estimated time')).toBe('1m 30s');
    });

    it('orders the receipt the same way every time', () => {
      view.renderSummary(config());
      view.renderPreview(summary());
      expect(rows().map(([label]) => label)).toEqual([
        'Newest',
        'Oldest',
        'Skipped by filters',
        'Estimated time',
        'Messages up to',
      ]);
    });
  });

  describe('the confirmation button', () => {
    it('names the action and the count', () => {
      view.renderSummary(config());
      view.renderPreview(summary({ totalCount: 12 }));
      expect(text('confirmLabel')).toBe('Delete 12 messages');
    });

    it('counts one message in the singular', () => {
      view.renderPreview(summary({ totalCount: 1 }));
      expect(text('confirmLabel')).toBe('Delete 1 message');
    });

    it('bounds a filtered count', () => {
      view.renderPreview(summary({ totalCount: 4, filtersApplied: true }));
      expect(text('confirmLabel')).toBe('Delete up to 4 messages');
      expect(text('reviewCount')).toBe('up to 4');
    });

    it('keeps a bounded single message singular', () => {
      view.renderPreview(summary({ totalCount: 1, filtersApplied: true }));
      expect(text('confirmLabel')).toBe('Delete up to 1 message');
    });

    it('reads as counting until the preview lands, and stays disabled', () => {
      view.setConfirmEnabled(false);
      view.showScanning();
      expect(text('confirmLabel')).toBe('Counting\u2026');
      expect(text('reviewCount')).toBe('\u2014');
      expect(text('reviewDetails')).toBe('Counting messages\u2026');
      const button = root.querySelector('[data-bind="confirmButton"]') as HTMLButtonElement;
      expect(button.hasAttribute('disabled')).toBe(true);
    });

    it('is enabled and disabled through attributes the controller reads', () => {
      const button = root.querySelector('[data-bind="confirmButton"]') as HTMLButtonElement;
      view.setConfirmEnabled(true);
      expect(button.hasAttribute('disabled')).toBe(false);
      view.setConfirmEnabled(false);
      expect(button.hasAttribute('disabled')).toBe(true);
    });

    it('keeps the button element, so the hold control can own it', () => {
      const button = root.querySelector('[data-bind="confirmButton"]') as HTMLButtonElement;
      view.setConfirmLabel('Delete 3 messages');
      expect(root.querySelector('[data-bind="confirmButton"]')).toBe(button);
      expect(button.getAttribute('data-action')).toBe('confirmDelete');
    });
  });

  describe('states', () => {
    it('drops back to a neutral label when counting fails', () => {
      view.renderSummary(config());
      view.showScanning();
      view.showScanFailed();
      expect(text('reviewCount')).toBe('?');
      expect(text('confirmLabel')).toBe('Delete messages');
      expect(rowValue('Newest')).toBe('\u2014');
    });

    it('reports how many channels a run spans, and only then', () => {
      view.renderSummary(config({ scope: 'specific', selectedChannelIds: [CHANNEL_A, CHANNEL_B] }));
      view.renderPreview(summary({ channelCount: 2, channelsCounted: 2 }));
      expect(text('reviewDetails')).toBe('Across 2 channels');
      view.renderPreview(summary());
      expect(text('reviewDetails')).toBe('');
    });

    it('renders the sample as plain rows, truncating long messages', () => {
      view.renderPreview(
        summary({
          sampleMessages: [
            message('a', new Date(2024, 0, 1).toISOString(), 'x'.repeat(80)),
            message('b', new Date(2024, 0, 1).toISOString(), ''),
          ],
        }),
      );
      const shown = [...root.querySelectorAll('[data-bind="previewContent"] div')];
      expect(shown).toHaveLength(2);
      expect(shown[0]?.textContent).toBe(`${'x'.repeat(60)}...`);
      expect(shown[1]?.textContent).toBe('[No text content]');
    });

    it('says when nothing came back', () => {
      view.renderPreview(summary({ totalCount: 0 }));
      expect(text('previewContent')).toBe('No messages found');
    });

    it('shows and clears inline errors', () => {
      view.showError('reviewError', 'Search index is being built');
      const el = root.querySelector('[data-bind="reviewError"]') as HTMLElement;
      expect(el.textContent).toBe('Search index is being built');
      expect(el.classList.contains('visible')).toBe(true);
      view.clearErrors();
      expect(el.textContent).toBe('');
      expect(el.classList.contains('visible')).toBe(false);
    });
  });
});
