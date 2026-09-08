import { beforeEach, describe, expect, it } from 'vitest';
import { createWindowHTML } from './window-markup';
import {
  applyWizardState,
  createWizardState,
  describeWizardSummary,
  isFilterOn,
  readWizardInputs,
  resetWizardState,
  resolveTimeRange,
  TIME_RANGE_LABELS,
  toggleFilter,
  validatePatternInput,
  WIZARD_STEPS,
  type WizardState,
} from './wizard';
import { createWizardStepsHTML } from './wizard-markup';

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

describe('resolveTimeRange', () => {
  const now = new Date('2024-03-15T09:30:00.000Z');

  it('returns no bounds for "all"', () => {
    const result = resolveTimeRange(createWizardState(), now);
    expect(result).toEqual({ ok: true, after: null, before: null });
  });

  it('covers exactly 24 hours for the 24h preset', () => {
    const state = createWizardState();
    state.timeRange = '24h';
    const result = resolveTimeRange(state, now);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(now.getTime() - (result.after as Date).getTime()).toBe(24 * HOUR);
    expect(result.before).toBeNull();
  });

  it('covers exactly 72 hours and 30 days for the other relative presets', () => {
    const state = createWizardState();
    state.timeRange = '72h';
    const seventyTwo = resolveTimeRange(state, now);
    expect(seventyTwo.ok && now.getTime() - (seventyTwo.after as Date).getTime()).toBe(72 * HOUR);

    state.timeRange = '30d';
    const thirty = resolveTimeRange(state, now);
    expect(thirty.ok && now.getTime() - (thirty.after as Date).getTime()).toBe(30 * DAY);
  });

  it('sets only the upper bound for the "older than" presets', () => {
    const state = createWizardState();
    state.timeRange = 'older-30d';
    const result = resolveTimeRange(state, now);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.after).toBeNull();
    expect(now.getTime() - (result.before as Date).getTime()).toBe(30 * DAY);
  });

  it('parses custom dates as local start and end of day', () => {
    const state = createWizardState();
    state.timeRange = 'custom';
    state.customAfter = '2024-02-01';
    state.customBefore = '2024-02-03';
    const result = resolveTimeRange(state, now);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const after = result.after as Date;
    const before = result.before as Date;
    expect([after.getFullYear(), after.getMonth(), after.getDate()]).toEqual([2024, 1, 1]);
    expect([after.getHours(), after.getMinutes(), after.getSeconds()]).toEqual([0, 0, 0]);
    expect([before.getFullYear(), before.getMonth(), before.getDate()]).toEqual([2024, 1, 3]);
    expect([before.getHours(), before.getMinutes(), before.getSeconds()]).toEqual([23, 59, 59]);
  });

  it('rejects a custom range with no dates', () => {
    const state = createWizardState();
    state.timeRange = 'custom';
    const result = resolveTimeRange(state, now);
    expect(result.ok).toBe(false);
  });

  it('rejects an unparseable custom date', () => {
    const state = createWizardState();
    state.timeRange = 'custom';
    state.customAfter = 'yesterday';
    const result = resolveTimeRange(state, now);
    expect(result.ok).toBe(false);
    expect(result.ok === false && result.error).toMatch(/"from" date/);

    state.customAfter = '';
    state.customBefore = 'tomorrow';
    const second = resolveTimeRange(state, now);
    expect(second.ok === false && second.error).toMatch(/"to" date/);
  });

  it('has a label for every preset', () => {
    for (const id of Object.keys(TIME_RANGE_LABELS)) {
      expect(TIME_RANGE_LABELS[id as keyof typeof TIME_RANGE_LABELS]).toBeTruthy();
    }
  });
});

describe('validatePatternInput', () => {
  it('accepts an empty pattern', () => {
    expect(validatePatternInput(createWizardState())).toBeNull();
  });

  it('accepts a safe pattern', () => {
    const state = createWizardState();
    state.pattern = '^gg$';
    expect(validatePatternInput(state)).toBeNull();
  });

  it('reports the validator message for a dangerous pattern', () => {
    const state = createWizardState();
    state.pattern = '(a+)+';
    expect(validatePatternInput(state)).toMatch(/performance/i);
  });
});

describe('toggleFilter', () => {
  it('flips each known filter and ignores unknown names', () => {
    const state = createWizardState();
    expect(toggleFilter(state, 'hasLink')).toBe(true);
    expect(toggleFilter(state, 'hasFile')).toBe(true);
    expect(toggleFilter(state, 'includePinned')).toBe(true);
    expect(toggleFilter(state, 'nope')).toBeNull();
    expect(isFilterOn(state, 'hasLink')).toBe(true);
    expect(isFilterOn(state, 'nope')).toBe(false);
    expect(toggleFilter(state, 'hasLink')).toBe(false);
  });
});

describe('wizard DOM binding', () => {
  let root: HTMLElement;
  let state: WizardState;

  beforeEach(() => {
    root = document.createElement('div');
    root.innerHTML = createWindowHTML();
    document.body.appendChild(root);
    state = createWizardState();
    applyWizardState(state, root);
  });

  it('reads the free-text inputs into state', () => {
    (root.querySelector('[data-input="contentFilter"]') as HTMLInputElement).value = '  hi  ';
    (root.querySelector('[data-input="pattern"]') as HTMLInputElement).value = '^a$';
    (root.querySelector('[data-input="manualChannelId"]') as HTMLInputElement).value = '123';
    (root.querySelector('[data-input="afterDate"]') as HTMLInputElement).value = '2024-01-01';
    readWizardInputs(state, root);
    expect(state.content).toBe('hi');
    expect(state.pattern).toBe('^a$');
    expect(state.manualChannelId).toBe('123');
    expect(state.customAfter).toBe('2024-01-01');
  });

  it('hides the oldest-first control', () => {
    const group = root.querySelector('[data-bind="deletionOrderGroup"]');
    expect(group).not.toBeNull();
    expect(group?.classList.contains('visible')).toBe(false);
  });

  it('shows the picker and manual field only for the specific target', () => {
    state.target = 'specific';
    applyWizardState(state, root);
    expect(root.querySelector('[data-bind="channelPicker"]')?.classList.contains('visible')).toBe(
      true,
    );
    state.target = 'channel';
    applyWizardState(state, root);
    expect(root.querySelector('[data-bind="channelPicker"]')?.classList.contains('visible')).toBe(
      false,
    );
  });

  it('resets state and DOM controls together', () => {
    // Turn every switch on and fill every field, exactly as a user would.
    for (const toggle of root.querySelectorAll<HTMLElement>('[data-action="toggleFilter"]')) {
      const key = toggle.getAttribute('data-toggle') as string;
      toggleFilter(state, key);
      toggle.classList.add('on');
    }
    state.target = 'specific';
    state.timeRange = '24h';
    state.stepIndex = 3;
    state.selectedChannels.add('111111111111111111');
    (root.querySelector('[data-input="contentFilter"]') as HTMLInputElement).value = 'stale';
    (root.querySelector('[data-input="pattern"]') as HTMLInputElement).value = 'stale';
    (root.querySelector('[data-input="afterDate"]') as HTMLInputElement).value = '2024-01-01';
    readWizardInputs(state, root);

    resetWizardState(state, root);

    expect(state).toMatchObject({
      stepIndex: 0,
      target: 'channel',
      timeRange: 'all',
      hasLink: false,
      hasFile: false,
      includePinned: false,
      content: '',
      pattern: '',
      customAfter: '',
    });
    expect(state.selectedChannels.size).toBe(0);

    // Every switch in the DOM must agree with the state behind it.
    for (const toggle of root.querySelectorAll<HTMLElement>('[data-action="toggleFilter"]')) {
      const key = toggle.getAttribute('data-toggle') as string;
      expect(toggle.classList.contains('on')).toBe(isFilterOn(state, key));
    }
    expect((root.querySelector('[data-input="contentFilter"]') as HTMLInputElement).value).toBe('');
    expect((root.querySelector('[data-input="pattern"]') as HTMLInputElement).value).toBe('');
    expect((root.querySelector('[data-input="afterDate"]') as HTMLInputElement).value).toBe('');
    expect(root.querySelector('[data-target="channel"]')?.classList.contains('selected')).toBe(
      true,
    );
    expect(root.querySelector('[data-target="specific"]')?.classList.contains('selected')).toBe(
      false,
    );
  });

  it('exposes the four wizard steps in order', () => {
    expect([...WIZARD_STEPS]).toEqual(['location', 'timerange', 'filters', 'review']);
  });

  it('marks the selected row for assistive technology as well as the eye', () => {
    state.timeRange = '30d';
    applyWizardState(state, root);
    const selected = root.querySelector('[data-timerange="30d"]');
    const other = root.querySelector('[data-timerange="all"]');
    expect(selected?.getAttribute('aria-checked')).toBe('true');
    expect(other?.getAttribute('aria-checked')).toBe('false');
  });

  it('writes the summary line whenever state is applied', () => {
    state.target = 'server';
    state.timeRange = '30d';
    state.hasLink = true;
    applyWizardState(state, root);
    expect(root.querySelector('[data-bind="wizardSummary"]')?.textContent).toBe(
      'every channel in this server \u00B7 last 30 days \u00B7 with links, pinned kept',
    );
  });

  it('names a picked channel from the rows the picker rendered', () => {
    const list = root.querySelector('[data-bind="channelList"]') as HTMLElement;
    list.innerHTML =
      '<div data-channel-id="111111111111111111">' +
      '<span class="detcord-channel-name">general</span></div>';
    state.target = 'specific';
    state.selectedChannels.add('111111111111111111');
    applyWizardState(state, root);
    expect(root.querySelector('[data-bind="wizardSummary"]')?.textContent).toContain('#general');
  });

  it('clears the summary back to its defaults on reset', () => {
    state.target = 'server';
    state.hasFile = true;
    applyWizardState(state, root);
    resetWizardState(state, root);
    expect(root.querySelector('[data-bind="wizardSummary"]')?.textContent).toBe(
      'this channel \u00B7 all time \u00B7 pinned kept',
    );
  });
});

describe('describeWizardSummary', () => {
  it('reads target, range and filters in one line', () => {
    const state = createWizardState();
    state.timeRange = '30d';
    state.hasLink = true;
    const summary = describeWizardSummary(state, {
      currentChannelId: '111111111111111111',
      channelName: () => 'current-channel',
    });
    expect(summary).toBe('#current-channel \u00B7 last 30 days \u00B7 with links, pinned kept');
  });

  it('falls back to the channel ID when no name is known', () => {
    const state = createWizardState();
    const summary = describeWizardSummary(state, { currentChannelId: '111111111111111111' });
    expect(summary.startsWith('111111111111111111 \u00B7')).toBe(true);
  });

  it('says so when Detcord cannot see a channel at all', () => {
    expect(describeWizardSummary(createWizardState())).toBe(
      'this channel \u00B7 all time \u00B7 pinned kept',
    );
  });

  it('counts a multi-channel selection and includes a manual ID', () => {
    const state = createWizardState();
    state.target = 'specific';
    state.selectedChannels.add('111111111111111111');
    state.manualChannelId = '222222222222222222';
    expect(describeWizardSummary(state)).toContain('2 channels');
  });

  it('reports an empty specific selection rather than implying a target', () => {
    const state = createWizardState();
    state.target = 'specific';
    expect(describeWizardSummary(state)).toContain('no channels picked');
  });

  it('names the DM and server scopes', () => {
    const dm = createWizardState();
    dm.target = 'dm';
    expect(describeWizardSummary(dm)).toContain('this DM');
    const server = createWizardState();
    server.target = 'server';
    expect(describeWizardSummary(server)).toContain('every channel in this server');
  });

  it('spells out a custom range from the dates entered', () => {
    const state = createWizardState();
    state.timeRange = 'custom';
    expect(describeWizardSummary(state)).toContain('custom range');
    state.customAfter = '2024-01-01';
    expect(describeWizardSummary(state)).toContain('after 2024-01-01');
    state.customBefore = '2024-02-01';
    expect(describeWizardSummary(state)).toContain('2024-01-01 to 2024-02-01');
    state.customAfter = '';
    expect(describeWizardSummary(state)).toContain('before 2024-02-01');
  });

  it('quotes text filters and cuts long ones short', () => {
    const state = createWizardState();
    state.content = 'a'.repeat(40);
    state.pattern = '^gg$';
    const summary = describeWizardSummary(state);
    expect(summary).toContain(`containing "${'a'.repeat(24)}\u2026"`);
    expect(summary).toContain('matching /^gg$/');
  });

  it('states what happens to pinned messages either way', () => {
    const state = createWizardState();
    expect(describeWizardSummary(state)).toContain('pinned kept');
    state.includePinned = true;
    expect(describeWizardSummary(state)).toContain('pinned included');
  });
});

describe('wizard markup', () => {
  const html = createWizardStepsHTML();

  it('titles the steps as statements', () => {
    const titles = [...html.matchAll(/-step-title">([^<]+)</g)].map((match) => match[1]);
    expect(titles).toEqual(['Target', 'Range', 'Filters', 'Review']);
  });

  it('carries no emoji', () => {
    expect(html).not.toMatch(/\p{Extended_Pictographic}/u);
  });

  it('offers every target and range as a keyboard-operable row', () => {
    const root = document.createElement('div');
    root.innerHTML = html;
    const rows = root.querySelectorAll('[data-action="selectTarget"], [data-timerange]');
    expect(rows.length).toBe(11);
    for (const row of rows) {
      expect(row.tagName).toBe('BUTTON');
      expect(row.querySelectorAll('span')).toHaveLength(2);
    }
  });

  it('keeps every binding the controller drives', () => {
    for (const binding of [
      'wizardSummary',
      'serverCard',
      'dmCard',
      'channelPicker',
      'channelList',
      'selectedChannelCount',
      'manualIdContainer',
      'locationError',
      'dateRangeContainer',
      'timeRangeError',
      'deletionOrderGroup',
      'patternError',
      'reviewSummary',
      'reviewCount',
      'reviewCountLabel',
      'reviewDetails',
      'reviewRows',
      'previewList',
      'previewContent',
      'reviewError',
      'confirmButton',
    ]) {
      expect(html).toContain(`data-bind="${binding}"`);
    }
  });

  it('says Continue rather than anything cuter', () => {
    expect(html).toContain('Continue');
    expect(html).not.toContain('Begin Sweep');
  });
});
