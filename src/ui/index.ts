/**
 * UI modules for Detcord
 */

export type { DetcordUIOptions } from './controller';
export { DetcordUI } from './controller';

// Effects exports
export {
  createConfetti,
  createStatusRotator,
  flashElement,
  runCountdownSequence,
  STATUS_MESSAGES,
  shakeElement,
} from './effects';

// Template exports
export type { PreviewMessage } from './templates';
export {
  createConfettiContainer,
  createCountdownOverlay,
  createPreviewScreenContent,
  createStatusMessageElement,
} from './templates';
