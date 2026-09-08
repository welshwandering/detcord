/**
 * UI modules for Detcord
 */

export type { ChannelPickerOptions, PickerChannel } from './channel-picker';
export { ChannelPicker } from './channel-picker';
export type { DetcordUIOptions, ScreenId } from './controller';
export { DetcordUI } from './controller';

// Hold-to-confirm
export type { HoldToConfirmHandle, HoldToConfirmOptions } from './effects';
export {
  HOLD_REARM_WINDOW_MS,
  HOLD_SECOND_STEP_LABEL,
  HOLD_TO_CONFIRM_MS,
  runHoldToConfirm,
} from './effects';

// Progress and completion view
export type { FeedEntry, ProgressViewOptions, ReceiptRow } from './progress-view';
export {
  completionReceipt,
  completionTitle,
  createFeedElement,
  createReceiptRow,
  feedOutcomeLabel,
  formatLogTime,
  ProgressView,
  rateLimitStatus,
} from './progress-view';

// Run configuration
export type { RunConfig, RunConfigInput, RunConfigResult, TargetScope } from './run-config';
export {
  buildRunConfig,
  describeRunConfig,
  describeTarget,
  describeTimeRange,
  engineOptionsFor,
  runConfigSignature,
} from './run-config';

// Deletion runner
export type {
  ChannelPosition,
  PreviewSummary,
  RunnerCallbacks,
  RunProgress,
  RunSummary,
  RunTotals,
} from './runner';
export { DeletionRunner } from './runner';

// Template exports
export type { PreviewMessage } from './templates';
export {
  createConfettiContainer,
  createCountdownOverlay,
  createPreviewScreenContent,
  createStatusMessageElement,
} from './templates';

// Wizard state
export type { TimeRangeId, WizardState, WizardStep } from './wizard';
export {
  applyWizardState,
  createWizardState,
  readWizardInputs,
  resetWizardState,
  resolveTimeRange,
  TIME_RANGE_LABELS,
  toggleFilter,
  validatePatternInput,
  WIZARD_STEPS,
} from './wizard';
