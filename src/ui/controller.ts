/**
 * Detcord UI controller.
 *
 * Owns the floating window: mounting, showing, event delegation and wizard
 * navigation. All the heavy lifting lives in siblings - `wizard.ts` for form
 * state, `run-config.ts` for the immutable config, `runner.ts` for the engine,
 * `progress-view.ts` for the running and completion screens.
 */

import { getChannelIdFromUrl, getGuildIdFromUrl } from '../core/token';
import { createCleanupManager } from '../utils/performance';
import { ChannelPicker, channelNameFromDom } from './channel-picker';
import {
  CSS_PREFIX,
  DEFAULT_FEED_THROTTLE_MS,
  DEFAULT_MAX_FEED_ENTRIES,
  DEFAULT_PROGRESS_THROTTLE_MS,
} from './constants';
import { type HoldToConfirmHandle, runHoldToConfirm } from './effects';
import { confirmToken, errorMessage, type IdentityResult, resolveIdentity } from './identity';
import {
  type ApiClientFactory,
  type ApiClientPort,
  clearProgress,
  createDefaultApiClient,
  createDefaultEngine,
  findResumableSession as defaultFindResumableSession,
  type EngineFactory,
  type SavedProgress,
  targetKeyFor,
} from './ports';
import { ProgressView } from './progress-view';
import { describeSavedSession, resumePlanFor, savedSessionTarget } from './resume';
import { ReviewView } from './review-view';
import { buildRunConfig, type RunConfig, runConfigSignature, type TargetScope } from './run-config';
import {
  clearRunPlan,
  loadRunPlan,
  pruneRunPlans,
  type RunPlan,
  type RunPlanTotals,
} from './run-plan';
import { RUN_STYLES } from './run-styles';
import { DeletionRunner, type RunProgress, type RunSummary } from './runner';
import { createMiniIndicator, type DraggingHandle, enableWindowDragging } from './window-chrome';
import { createWindowHTML, TRIGGER_ICON } from './window-markup';
import { WINDOW_STYLES } from './window-styles';
import {
  applyWizardState,
  createWizardState,
  isRelativeTimeRange,
  readWizardInputs,
  resetWizardState,
  resolveTimeRange,
  TIME_RANGE_LABELS,
  type TimeRangeId,
  toggleFilter,
  validatePatternInput,
  WIZARD_STEPS,
  type WizardState,
  type WizardStep,
  type WizardSummaryContext,
  writeWizardSummary,
} from './wizard';
import { WIZARD_STYLES } from './wizard-styles';

/** Screens the window can display. */
export type ScreenId = 'setup' | 'running' | 'complete' | 'error';

/** Options for the DetcordUI controller. */
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
  /** Overrides the Discord API client, for tests */
  createApiClient?: ApiClientFactory;
  /** Overrides the deletion engine, for tests */
  createEngine?: EngineFactory;
  /** Overrides how an interrupted session is found, for tests */
  findResumableSession?: (authorId: string) => SavedProgress | null;
}

/** How often the route is re-checked while the review step is open (ms). */
const ROUTE_WATCH_INTERVAL_MS = 250;

/** Message shown when the SPA navigates away from the reviewed target. */
const ROUTE_DRIFT_MESSAGE =
  'You navigated to a different channel, so the preview no longer matches. Check the target and continue again.';

/** Message shown when the Discord account changed under a reviewed config. */
const ACCOUNT_CHANGED_MESSAGE =
  'Your Discord account changed, so that run no longer applies. Check the target and continue again.';

/**
 * Main UI controller for Detcord.
 */
export class DetcordUI {
  private readonly options: Required<
    Pick<
      DetcordUIOptions,
      'onShow' | 'onHide' | 'maxFeedEntries' | 'progressThrottleMs' | 'feedThrottleMs'
    >
  >;
  private readonly createApiClient: ApiClientFactory;
  private readonly findResumableSession: (authorId: string) => SavedProgress | null;

  private mounted = false;
  private visible = false;
  private minimized = false;
  private currentScreen: ScreenId = 'setup';
  private identityChecked = false;
  private manualIdentity = false;

  private token: string | null = null;
  private authorId: string | null = null;
  private apiClient: ApiClientPort | null = null;

  private container: HTMLDivElement | null = null;
  private windowEl: HTMLElement | null = null;
  private backdropEl: HTMLElement | null = null;
  private miniIndicator: HTMLElement | null = null;

  private readonly cleanup = createCleanupManager();
  private readonly cancellables: Array<{ cancel: () => void }> = [];
  private readonly wizardState: WizardState = createWizardState();
  private readonly progressView: ProgressView;
  private readonly runner: DeletionRunner;
  private channelPicker: ChannelPicker | null = null;
  private reviewView: ReviewView | null = null;
  private dragging: DraggingHandle | null = null;

  private reviewConfig: RunConfig | null = null;
  private previewSignature: string | null = null;
  private previewTotal: number | null = null;
  private scanning = false;
  private hold: HoldToConfirmHandle | null = null;
  private routeWatchId: ReturnType<typeof setInterval> | null = null;
  private pendingResume: SavedProgress | null = null;
  private pendingPlan: RunPlan | null = null;
  private resumeWith: SavedProgress | null = null;
  private resumeTotals: RunPlanTotals | null = null;
  private resumeExpectedTotal: number | null = null;
  private identityGeneration = 0;
  /** True while the page is being asked which account it shows. */
  private identityPending = false;
  private lastProgress: RunProgress | null = null;

  constructor(options?: DetcordUIOptions) {
    this.options = {
      onShow: options?.onShow ?? ((): void => {}),
      onHide: options?.onHide ?? ((): void => {}),
      maxFeedEntries: options?.maxFeedEntries ?? DEFAULT_MAX_FEED_ENTRIES,
      progressThrottleMs: options?.progressThrottleMs ?? DEFAULT_PROGRESS_THROTTLE_MS,
      feedThrottleMs: options?.feedThrottleMs ?? DEFAULT_FEED_THROTTLE_MS,
    };
    this.createApiClient = options?.createApiClient ?? createDefaultApiClient;
    this.findResumableSession = options?.findResumableSession ?? defaultFindResumableSession;

    this.progressView = new ProgressView({
      maxFeedEntries: this.options.maxFeedEntries,
      progressThrottleMs: this.options.progressThrottleMs,
      feedThrottleMs: this.options.feedThrottleMs,
    });

    const createEngine: EngineFactory = options?.createEngine ?? createDefaultEngine;
    this.runner = new DeletionRunner({
      createApiClient: this.createApiClient,
      createEngine,
      callbacks: {
        onChannelStart: (position) => this.progressView.setChannelPosition(position),
        onProgress: (progress, message, outcome) => {
          this.lastProgress = progress;
          this.progressView.push(progress, message.id, message.content, outcome);
        },
        onStatus: (status) => this.progressView.setStatus(status),
        onRateLimitChange: (info) =>
          this.progressView.setThrottleState(info.isThrottled, info.currentDelay),
        onFinish: (summary) => this.handleRunFinished(summary),
      },
    });
  }

  // =========================================================================
  // Public lifecycle
  // =========================================================================

  /** Mounts the UI into the DOM. */
  mount(): void {
    if (this.mounted) {
      return;
    }

    this.injectStyles();

    this.container = document.createElement('div');
    this.container.id = `${CSS_PREFIX}-container`;

    const trigger = document.createElement('button');
    trigger.className = `${CSS_PREFIX}-trigger`;
    trigger.innerHTML = TRIGGER_ICON;
    trigger.setAttribute('aria-label', 'Open Detcord');
    trigger.setAttribute('data-action', 'toggle');

    const windowContainer = document.createElement('div');
    windowContainer.innerHTML = createWindowHTML();

    this.container.appendChild(trigger);
    this.container.appendChild(windowContainer);
    document.body.appendChild(this.container);

    this.windowEl = this.container.querySelector(`.${CSS_PREFIX}-window`);
    this.backdropEl = this.container.querySelector(`.${CSS_PREFIX}-backdrop`);

    if (this.windowEl) {
      this.progressView.attach(this.windowEl);
      this.reviewView = new ReviewView(this.windowEl);
      this.channelPicker = new ChannelPicker({
        root: this.windowEl,
        selected: this.wizardState.selectedChannels,
        onChange: () => {
          this.invalidateReview();
          this.refreshWizardSummary();
        },
      });
      applyWizardState(this.wizardState, this.windowEl, this.summaryContext());
    }

    this.setupEventDelegation();
    this.setupDragging();
    this.setupHoldToConfirm();
    this.mounted = true;
  }

  /** Unmounts the UI and releases every listener and timer. */
  unmount(): void {
    if (!this.mounted) {
      return;
    }

    this.runner.dispose();
    this.hold?.();
    this.hold = null;
    this.stopRouteWatch();
    this.progressView.dispose();

    for (const cancellable of this.cancellables) {
      cancellable.cancel();
    }
    this.cancellables.length = 0;
    this.cleanup.dispose();

    this.dragging?.dispose();
    this.dragging = null;
    this.container?.remove();
    this.container = null;
    this.windowEl = null;
    this.backdropEl = null;
    this.miniIndicator = null;
    this.channelPicker = null;
    this.reviewView = null;

    document.getElementById(`${CSS_PREFIX}-styles`)?.remove();

    this.mounted = false;
    this.visible = false;
  }

  /** Shows the window. */
  show(): void {
    if (!this.mounted || this.visible) {
      return;
    }

    this.windowEl?.classList.add('visible');
    this.backdropEl?.classList.add('visible');
    this.visible = true;
    this.setVisibility('runChoice', false);
    this.updateTargetCards();

    // Identity is re-checked on every open: the SPA can switch accounts, and a
    // first failure has to be retryable. A hand-pasted token is no exception -
    // the account behind it can be switched away from just as easily - so the
    // page is asked again and the pasted token only kept when it cannot answer.
    if (!this.runner.isActive()) {
      // Nothing left over from the previous open may be acted on until the
      // page has answered: a prompt that stayed visible could otherwise start
      // a run under an account Discord no longer shows.
      this.pendingResume = null;
      this.pendingPlan = null;
      this.setVisibility('resumePrompt', false);
      void this.establishIdentity();
    } else if (this.identityChecked && this.authorId) {
      this.offerResume(this.authorId);
    }

    this.options.onShow();
  }

  /** Hides the window and cancels anything that should not outlive it. */
  hide(): void {
    if (!this.visible) {
      return;
    }

    this.cancelHold();
    this.stopRouteWatch();
    this.windowEl?.classList.remove('visible');
    this.backdropEl?.classList.remove('visible');
    this.setVisibility('runChoice', false);
    this.visible = false;
    this.options.onHide();
  }

  /** Whether the window is visible. */
  isVisible(): boolean {
    return this.visible;
  }

  /** Whether a deletion run is in flight. */
  isRunning(): boolean {
    return this.runner.isActive();
  }

  /** The screen currently on display. */
  getCurrentScreen(): ScreenId {
    return this.currentScreen;
  }

  /**
   * Switches to a different screen.
   *
   * @param screenId - The screen to show
   */
  showScreen(screenId: ScreenId): void {
    if (!this.windowEl) {
      return;
    }
    for (const screen of this.windowEl.querySelectorAll('[data-screen]')) {
      screen.classList.toggle('active', screen.getAttribute('data-screen') === screenId);
    }
    this.currentScreen = screenId;
  }

  // =========================================================================
  // Setup
  // =========================================================================

  private injectStyles(): void {
    if (document.getElementById(`${CSS_PREFIX}-styles`)) {
      return;
    }
    const styleEl = document.createElement('style');
    styleEl.id = `${CSS_PREFIX}-styles`;
    styleEl.textContent = [WINDOW_STYLES, WIZARD_STYLES, RUN_STYLES].join('\n');
    document.head.appendChild(styleEl);
  }

  private buildActionMap(): Record<string, (element: HTMLElement) => void> {
    return {
      toggle: () => (this.visible ? this.requestClose() : this.show()),
      close: () => this.requestClose(),
      keepRunning: () => this.hide(),
      stopRun: () => {
        this.setVisibility('runChoice', false);
        this.runner.stop();
      },
      pause: () => this.handlePause(),
      stop: () => this.runner.stop(),
      reset: () => this.handleReset(),
      useManualToken: () => void this.handleManualToken(),
      nextStep: () => this.goToStep(this.wizardState.stepIndex + 1),
      prevStep: () => this.goToStep(this.wizardState.stepIndex - 1),
      selectTarget: (element) => this.handleSelectTarget(element),
      selectTimeRange: (element) => this.handleSelectTimeRange(element),
      toggleFilter: (element) => this.handleToggleFilter(element),
      toggleChannel: (element) => this.channelPicker?.toggle(element),
      minimize: () => this.handleMinimize(),
      maximize: () => this.handleMaximize(),
      resumeSession: () => this.handleResumeSession(),
      discardSession: () => this.handleDiscardSession(),
    };
  }

  private setupEventDelegation(): void {
    const container = this.container;
    if (!container) {
      return;
    }
    const actions = this.buildActionMap();

    const handleClick = (event: Event): void => {
      const actionEl = (event.target as HTMLElement).closest<HTMLElement>('[data-action]');
      if (!actionEl || actionEl.hasAttribute('disabled')) {
        return;
      }
      actions[actionEl.getAttribute('data-action') ?? '']?.(actionEl);
    };
    container.addEventListener('click', handleClick);
    this.cleanup.add(() => container.removeEventListener('click', handleClick));

    const handleInput = (event: Event): void => {
      const target = event.target as HTMLElement;
      const name = target.getAttribute('data-input');
      if (name === 'channelSearch') {
        this.channelPicker?.filter((target as HTMLInputElement).value);
        return;
      }
      if (name) {
        this.invalidateReview();
        this.refreshWizardSummary();
      }
    };
    container.addEventListener('input', handleInput);
    this.cleanup.add(() => container.removeEventListener('input', handleInput));

    if (this.backdropEl) {
      const backdrop = this.backdropEl;
      const onBackdrop = (): void => this.requestClose();
      backdrop.addEventListener('click', onBackdrop);
      this.cleanup.add(() => backdrop.removeEventListener('click', onBackdrop));
    }

    const handleKeydown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape' && this.visible) {
        this.requestClose();
      }
    };
    document.addEventListener('keydown', handleKeydown);
    this.cleanup.add(() => document.removeEventListener('keydown', handleKeydown));
  }

  private setupDragging(): void {
    const header = this.windowEl?.querySelector<HTMLElement>(`.${CSS_PREFIX}-header`);
    if (header && this.windowEl) {
      this.dragging = enableWindowDragging(this.windowEl, header);
    }
  }

  /**
   * Arms the confirmation button.
   *
   * The destructive action has no click handler at all: only a completed hold
   * (or the reduced-motion second press) reaches {@link handleConfirmDelete},
   * so a stray click on a reviewed run cannot start it.
   */
  private setupHoldToConfirm(): void {
    const button = this.windowEl?.querySelector<HTMLElement>('[data-action="confirmDelete"]');
    if (!button) {
      return;
    }
    this.hold = runHoldToConfirm(button, { onConfirm: () => this.handleConfirmDelete() });
  }

  // =========================================================================
  // Identity
  // =========================================================================

  /**
   * Establishes which account the token belongs to, then offers any resume.
   *
   * A stale result - one from a request that a newer one has overtaken - is
   * dropped, so the account on screen is always the last one asked for.
   */
  private async establishIdentity(): Promise<void> {
    const generation = ++this.identityGeneration;
    this.identityPending = true;
    const identity = await resolveIdentity(this.createApiClient);
    if (generation !== this.identityGeneration) {
      return;
    }
    this.identityPending = false;
    if (!identity.ok) {
      if (this.keepManualIdentity()) {
        return;
      }
      // The flag stays unset so the next open, or "Try again", retries.
      this.identityChecked = false;
      this.showError(identity.error);
      return;
    }
    if (this.manualIdentity && identity.authorId === this.authorId) {
      // Same account: the token that was pasted is still the right one, and
      // replacing it would throw away a resume the user may be about to take.
      this.offerResume(identity.authorId);
      return;
    }
    this.acceptIdentity(identity.token, identity.authorId, identity.client, false);
  }

  /**
   * Keeps a confirmed manual identity when the page cannot be read.
   *
   * An unreadable page is the very reason a token was pasted, so it is not
   * evidence that the account changed.
   *
   * @returns True when the manual identity was kept and nothing else is due
   */
  private keepManualIdentity(): boolean {
    const authorId = this.authorId;
    if (!this.manualIdentity || !authorId) {
      return false;
    }
    this.offerResume(authorId);
    return true;
  }

  /**
   * Takes on a confirmed identity, discarding anything the previous account
   * had reviewed or could have resumed.
   *
   * @param token - The confirmed token
   * @param authorId - The account Discord says owns it
   * @param client - Client bound to that token
   * @param manual - Whether the token was pasted by hand
   */
  private acceptIdentity(
    token: string,
    authorId: string,
    client: ApiClientPort,
    manual: boolean,
  ): void {
    const switched = this.authorId !== null && this.authorId !== authorId;
    this.token = token;
    this.authorId = authorId;
    this.apiClient = client;
    this.identityChecked = true;
    this.manualIdentity = manual;

    if (switched) {
      this.invalidateReview();
      this.reviewView?.clearErrors();
      this.pendingResume = null;
      this.pendingPlan = null;
      this.resumeWith = null;
      this.resumeTotals = null;
      this.resumeExpectedTotal = null;
      this.setVisibility('resumePrompt', false);
    }
    // A confirmed identity clears whatever failure put the error screen up.
    if (this.currentScreen === 'error') {
      this.showScreen('setup');
      this.updateTargetCards();
    }
    this.offerResume(authorId);
  }

  /**
   * Accepts a hand-pasted token, but only once Discord confirms whose it is.
   */
  private async handleManualToken(): Promise<void> {
    const input = this.windowEl?.querySelector<HTMLInputElement>('[data-input="manualToken"]');
    let token = '';
    try {
      token = input?.value.trim() ?? '';
    } finally {
      // The token leaves the DOM before anything can await, so a client that
      // rejects it cannot leave it sitting in the field.
      if (input) {
        input.value = '';
      }
    }
    if (!token) {
      this.showError('Please enter a token.');
      return;
    }

    const generation = ++this.identityGeneration;
    this.setActionDisabled('useManualToken', true);
    let identity: IdentityResult;
    try {
      identity = await confirmToken(token, this.createApiClient, false);
    } finally {
      if (generation === this.identityGeneration) {
        this.setActionDisabled('useManualToken', false);
      }
    }

    if (generation !== this.identityGeneration) {
      return;
    }
    // A token confirmed by hand supersedes whatever page check was in flight.
    this.identityPending = false;
    if (!identity.ok) {
      this.showError(identity.error);
      return;
    }

    this.acceptIdentity(identity.token, identity.authorId, identity.client, true);
  }

  private setActionDisabled(action: string, disabled: boolean): void {
    const button = this.windowEl?.querySelector<HTMLElement>(`[data-action="${action}"]`);
    if (!button) {
      return;
    }
    if (disabled) {
      button.setAttribute('disabled', 'disabled');
    } else {
      button.removeAttribute('disabled');
    }
  }

  // =========================================================================
  // Wizard navigation
  // =========================================================================

  private goToStep(index: number): void {
    if (index < 0 || index >= WIZARD_STEPS.length) {
      return;
    }
    const step = WIZARD_STEPS[index] as WizardStep;
    if (step !== 'review') {
      this.stopRouteWatch();
    }
    this.wizardState.stepIndex = index;
    this.showWizardStep(step);
    if (step === 'review') {
      void this.enterReview();
    }
  }

  private showWizardStep(step: WizardStep): void {
    if (!this.windowEl) {
      return;
    }
    for (const el of this.windowEl.querySelectorAll('[data-wizard-step]')) {
      el.classList.toggle('active', el.getAttribute('data-wizard-step') === step);
    }
    const dots = this.windowEl.querySelectorAll('[data-step]');
    for (let i = 0; i < dots.length; i++) {
      const dot = dots[i];
      dot?.classList.toggle('active', i === this.wizardState.stepIndex);
      dot?.classList.toggle('completed', i < this.wizardState.stepIndex);
    }
  }

  private handleSelectTarget(element: HTMLElement): void {
    const target = element.getAttribute('data-target') as TargetScope | null;
    if (!target) {
      return;
    }
    this.wizardState.target = target;
    this.invalidateReview();
    if (this.windowEl) {
      applyWizardState(this.wizardState, this.windowEl, this.summaryContext());
    }
    if (target === 'specific') {
      void this.channelPicker?.load(this.apiClient, getGuildIdFromUrl());
    }
  }

  private handleSelectTimeRange(element: HTMLElement): void {
    const range = element.getAttribute('data-timerange') as TimeRangeId | null;
    if (!range) {
      return;
    }
    this.wizardState.timeRange = range;
    // A relative preset means what it said when it was picked, so the instant
    // it was measured from is pinned here rather than read again at review.
    this.wizardState.rangeSelectedAt = isRelativeTimeRange(range) ? Date.now() : null;
    this.invalidateReview();
    if (this.windowEl) {
      applyWizardState(this.wizardState, this.windowEl, this.summaryContext());
    }
  }

  private handleToggleFilter(element: HTMLElement): void {
    const key = element.getAttribute('data-toggle');
    if (!key) {
      return;
    }
    const value = toggleFilter(this.wizardState, key);
    if (value === null) {
      return;
    }
    element.classList.toggle('on', value);
    element.setAttribute('aria-checked', String(value));
    this.invalidateReview();
    this.refreshWizardSummary();
  }

  /** Names and current channel for the summary line. */
  private summaryContext(): WizardSummaryContext {
    const root = this.windowEl;
    return {
      currentChannelId: getChannelIdFromUrl(),
      channelName: (id) => (root ? channelNameFromDom(root, id) : undefined),
    };
  }

  /** Re-reads the text inputs and rewrites the summary line, nothing else. */
  private refreshWizardSummary(): void {
    if (!this.windowEl) {
      return;
    }
    readWizardInputs(this.wizardState, this.windowEl);
    writeWizardSummary(this.wizardState, this.windowEl, this.summaryContext());
  }

  private handleReset(): void {
    this.cancelHold();
    this.stopRouteWatch();
    this.progressView.reset();
    this.invalidateReview();
    this.resumeWith = null;
    this.resumeTotals = null;
    this.resumeExpectedTotal = null;
    this.lastProgress = null;
    this.reviewView?.clearErrors();
    if (this.windowEl) {
      resetWizardState(this.wizardState, this.windowEl, this.summaryContext());
    }
    // Clear the picker after the state, so its "N selected" label agrees.
    this.channelPicker?.clear();
    this.showScreen('setup');
    this.showWizardStep('location');
    // "Try again" on the error screen: retry the identity that failed.
    if (!this.identityChecked && !this.runner.isActive()) {
      void this.establishIdentity();
    }
  }

  // =========================================================================
  // Review, preview and the confirmation gate
  // =========================================================================

  private invalidateReview(): void {
    this.cancelHold();
    this.reviewConfig = null;
    this.previewSignature = null;
    this.previewTotal = null;
    this.reviewView?.setConfirmEnabled(false);
  }

  private showStepError(binding: string, message: string, step: WizardStep): void {
    this.reviewView?.showError(binding, message);
    if (step !== 'review') {
      this.wizardState.stepIndex = WIZARD_STEPS.indexOf(step);
      this.showWizardStep(step);
    }
  }

  /**
   * Builds the immutable config for this run, then previews exactly it.
   *
   * Preview, the summary on this screen and the run itself all read the very
   * same object, so what the user is shown is what gets deleted.
   */
  private async enterReview(): Promise<void> {
    this.invalidateReview();
    this.reviewView?.clearErrors();
    if (!this.windowEl) {
      return;
    }
    readWizardInputs(this.wizardState, this.windowEl);

    const built = this.buildConfigFromWizard();
    if (typeof built === 'string') {
      return;
    }

    this.reviewConfig = built;
    this.reviewView?.renderSummary(built);
    this.startRouteWatch();
    await this.runPreview(built);
  }

  /**
   * Validates the wizard and builds a config, reporting errors on the step
   * that owns the offending field.
   *
   * @returns The config, or the string 'invalid' when an error was shown
   */
  private buildConfigFromWizard(): RunConfig | string {
    const patternError = validatePatternInput(this.wizardState);
    if (patternError) {
      this.showStepError('patternError', patternError, 'filters');
      return 'invalid';
    }

    const range = resolveTimeRange(this.wizardState, new Date());
    if (!range.ok) {
      this.showStepError('timeRangeError', range.error, 'timerange');
      return 'invalid';
    }

    const built = buildRunConfig({
      authorId: this.authorId,
      scope: this.wizardState.target,
      guildId: getGuildIdFromUrl(),
      urlChannelId: getChannelIdFromUrl(),
      routePath: window.location.pathname,
      selectedChannelIds: [...this.wizardState.selectedChannels],
      manualChannelId: this.wizardState.manualChannelId,
      after: range.after,
      before: range.before,
      timeRangeLabel: TIME_RANGE_LABELS[this.wizardState.timeRange],
      content: this.wizardState.content,
      pattern: this.wizardState.pattern,
      hasLink: this.wizardState.hasLink,
      hasFile: this.wizardState.hasFile,
      includePinned: this.wizardState.includePinned,
      deletionOrder: this.wizardState.deletionOrder,
    });

    if (!built.ok) {
      this.showStepError('locationError', built.error, 'location');
      return 'invalid';
    }
    return built.config;
  }

  /**
   * Counts what the reviewed config would delete and gates the sweep button.
   *
   * @param config - The config being reviewed
   */
  private async runPreview(config: RunConfig): Promise<void> {
    const review = this.reviewView;
    if (!this.token || !review) {
      this.showStepError('reviewError', 'No Discord token available.', 'review');
      return;
    }

    this.scanning = true;
    review.setConfirmEnabled(false);
    review.showScanning();

    try {
      const summary = await this.runner.preview(this.token, config);
      if (this.reviewConfig !== config) {
        return;
      }
      review.renderPreview(summary);
      this.previewSignature = runConfigSignature(config);
      this.previewTotal = summary.totalCount;
      review.setConfirmEnabled(summary.totalCount > 0);
      if (summary.totalCount === 0) {
        this.showStepError('reviewError', 'Nothing matches those filters.', 'review');
      }
    } catch (error) {
      if (this.reviewConfig !== config) {
        return;
      }
      review.showScanFailed();
      this.previewSignature = null;
      this.previewTotal = null;
      review.setConfirmEnabled(false);
      this.showStepError('reviewError', errorMessage(error, 'Scan failed.'), 'review');
    } finally {
      this.scanning = false;
    }
  }

  private startRouteWatch(): void {
    this.stopRouteWatch();
    this.routeWatchId = setInterval(() => this.checkRouteDrift(), ROUTE_WATCH_INTERVAL_MS);
  }

  private stopRouteWatch(): void {
    if (this.routeWatchId !== null) {
      clearInterval(this.routeWatchId);
      this.routeWatchId = null;
    }
  }

  private checkRouteDrift(): boolean {
    const config = this.reviewConfig;
    if (!config || config.routePath === window.location.pathname) {
      return false;
    }
    this.cancelHold();
    this.stopRouteWatch();
    this.invalidateReview();
    this.wizardState.stepIndex = 0;
    this.showWizardStep('location');
    this.showStepError('locationError', ROUTE_DRIFT_MESSAGE, 'location');
    return true;
  }

  // =========================================================================
  // Running a deletion
  // =========================================================================

  /**
   * Starts the run the review screen has gated, once the hold completes.
   *
   * This is the hold's `onConfirm`: it can only be reached by a full 1.5
   * second press, so the checks here are the last line rather than the only
   * one. A second confirmation cannot start a second run.
   */
  private handleConfirmDelete(): void {
    if (this.runner.isActive() || this.scanning || this.identityPending) {
      return;
    }
    const config = this.reviewConfig;
    if (!config || this.previewSignature !== runConfigSignature(config)) {
      return;
    }
    if (this.checkRouteDrift()) {
      return;
    }

    this.reviewView?.setConfirmEnabled(false);
    this.beginRun(config);
  }

  private beginRun(config: RunConfig): void {
    if (this.runner.isActive() || this.checkRouteDrift() || !this.token) {
      return;
    }
    if (config.authorId !== this.authorId) {
      this.invalidateReview();
      this.resumeWith = null;
      this.resumeTotals = null;
      this.resumeExpectedTotal = null;
      this.showScreen('setup');
      this.showStepError('locationError', ACCOUNT_CHANGED_MESSAGE, 'location');
      return;
    }
    this.stopRouteWatch();
    this.lastProgress = null;
    this.progressView.reset();
    this.showScreen('running');

    const resumeFrom = this.resumeWith;
    // A resumed run keeps the checkpoint's identity, so every channel it goes
    // on to sweep still writes and reads that run's plan.
    const options = {
      resumeFrom: resumeFrom ?? undefined,
      baseTotals: this.resumeTotals ?? undefined,
      expectedTotal: resumeFrom ? this.resumeExpectedTotal : this.previewTotal,
      runId: resumeFrom?.runId,
    };
    this.resumeWith = null;
    this.resumeTotals = null;
    this.resumeExpectedTotal = null;
    void this.runner.start(this.token, config, options);
  }

  private handlePause(): void {
    const button = this.windowEl?.querySelector('[data-action="pause"]');
    const paused = !this.runner.isPaused();
    if (paused) {
      this.runner.pause();
    } else {
      this.runner.resume();
    }
    this.progressView.setPaused(paused);
    if (button) {
      button.textContent = paused ? 'Resume' : 'Pause';
    }
  }

  private handleRunFinished(summary: RunSummary): void {
    this.progressView.setPaused(false);
    this.progressView.flush(this.lastProgress);
    this.progressView.showCompletion(summary);
    this.setVisibility('runChoice', false);
    this.showScreen('complete');
    if (this.minimized) {
      this.handleMaximize();
    }
  }

  // =========================================================================
  // Resume
  // =========================================================================

  /**
   * Offers to continue an interrupted deletion for this account.
   *
   * The plan is looked up by the checkpoint's own run ID, so what the prompt
   * describes is exactly what accepting it would sweep.
   *
   * @param authorId - Confirmed Discord user ID
   */
  private offerResume(authorId: string): void {
    if (this.runner.isActive()) {
      return;
    }
    let saved: SavedProgress | null = null;
    try {
      saved = this.findResumableSession(authorId);
    } catch {
      saved = null;
    }
    this.pendingResume = saved;
    this.pendingPlan = null;
    pruneRunPlans(authorId);
    if (!saved) {
      this.setVisibility('resumePrompt', false);
      return;
    }
    this.pendingPlan = loadRunPlan(authorId, saved.runId);
    this.setBoundText('resumeText', describeSavedSession(saved, this.pendingPlan));
    this.setVisibility('resumePrompt', true);
  }

  private handleResumeSession(): void {
    const saved = this.pendingResume;
    const authorId = this.authorId;
    if (!saved || !this.token || !authorId || this.identityPending) {
      return;
    }
    const resume = resumePlanFor(
      saved,
      getChannelIdFromUrl(),
      window.location.pathname,
      this.pendingPlan,
    );
    if (!resume) {
      this.showStepError('locationError', 'That saved session has no usable target.', 'location');
      return;
    }
    this.setVisibility('resumePrompt', false);
    this.pendingResume = null;
    this.pendingPlan = null;
    this.resumeWith = saved;
    this.resumeTotals = resume.baseTotals;
    this.resumeExpectedTotal = resume.expectedTotal;
    this.reviewConfig = resume.config;
    this.beginRun(resume.config);
  }

  private handleDiscardSession(): void {
    const saved = this.pendingResume;
    this.pendingResume = null;
    this.pendingPlan = null;
    this.setVisibility('resumePrompt', false);
    if (saved) {
      clearProgress(saved.authorId, targetKeyFor(savedSessionTarget(saved)), saved.runId);
      clearRunPlan(saved.authorId, saved.runId);
    }
  }

  // =========================================================================
  // Window chrome
  // =========================================================================

  private requestClose(): void {
    if (this.runner.isActive()) {
      this.setVisibility('runChoice', true);
      return;
    }
    this.hide();
  }

  private handleMinimize(): void {
    if (!this.runner.isActive()) {
      this.requestClose();
      return;
    }
    if (!this.miniIndicator) {
      this.miniIndicator = createMiniIndicator();
      this.container?.appendChild(this.miniIndicator);
      this.progressView.setMiniIndicator(this.miniIndicator);
    }
    this.minimized = true;
    this.windowEl?.classList.remove('visible');
    this.backdropEl?.classList.remove('visible');
    this.miniIndicator.classList.add('visible');
  }

  private handleMaximize(): void {
    if (!this.minimized) {
      return;
    }
    this.minimized = false;
    this.miniIndicator?.classList.remove('visible');
    this.windowEl?.classList.add('visible');
    this.backdropEl?.classList.add('visible');
  }

  private updateTargetCards(): void {
    const guildId = getGuildIdFromUrl();
    const isDM = guildId === '@me';
    const isServer = Boolean(guildId && guildId !== '@me');
    const dmCard = this.windowEl?.querySelector<HTMLElement>('[data-bind="dmCard"]');
    const serverCard = this.windowEl?.querySelector<HTMLElement>('[data-bind="serverCard"]');
    if (dmCard) {
      dmCard.hidden = !isDM;
    }
    if (serverCard) {
      serverCard.hidden = !isServer;
    }
  }

  private cancelHold(): void {
    this.hold?.cancel();
  }

  private showError(message: string): void {
    this.setBoundText('errorMessage', message);
    this.showScreen('error');
  }

  private setBoundText(binding: string, value: string): void {
    const el = this.windowEl?.querySelector<HTMLElement>(`[data-bind="${binding}"]`);
    if (el) {
      el.textContent = value;
    }
  }

  private setVisibility(binding: string, visible: boolean): void {
    this.windowEl?.querySelector(`[data-bind="${binding}"]`)?.classList.toggle('visible', visible);
  }
}
