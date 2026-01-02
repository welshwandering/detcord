/**
 * UI modules for Detcord
 */

export { DetcordUI } from './controller';
export type { DetcordUIOptions } from './controller';

// Effects exports
export {
  createConfetti,
  runCountdownSequence,
  createStatusRotator,
  shakeElement,
  flashElement,
  STATUS_MESSAGES,
} from './effects';

// Template exports
export type { PreviewMessage } from './templates';
export {
  createPreviewScreenContent,
  createStatusMessageElement,
  createCountdownOverlay,
  createConfettiContainer,
} from './templates';
