/**
 * Shared constants for the Detcord UI layer.
 */

/** CSS class prefix used to scope every Detcord style rule. */
export const CSS_PREFIX = 'detcord';

/** Z-index for the floating window and its backdrop. */
export const WINDOW_Z_INDEX = 999999;

/** Maximum feed entries kept in the DOM to prevent memory growth. */
export const DEFAULT_MAX_FEED_ENTRIES = 100;

/** Throttle interval for progress updates (ms). */
export const DEFAULT_PROGRESS_THROTTLE_MS = 100;

/** Throttle interval for live feed updates (ms). */
export const DEFAULT_FEED_THROTTLE_MS = 50;

/** Maximum characters shown for a message preview in the live feed. */
export const MAX_PREVIEW_LENGTH = 80;

/** Radius of the large progress ring circle in the running screen. */
export const PROGRESS_RING_RADIUS = 52;

/** Radius of the small progress ring shown when the window is minimised. */
export const MINI_RING_RADIUS = 20;

/**
 * Whether the oldest-first deletion order is offered in the wizard.
 *
 * The oldest-first code path still exists in the engine but the UI for it is
 * being redesigned, so the control is hidden rather than removed.
 */
export const SHOW_OLDEST_FIRST = false;

/** Number of channels a multi-channel preview will actually count. */
export const MAX_PREVIEW_CHANNELS = 10;
