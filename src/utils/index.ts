/**
 * Utility functions for Detcord
 */

export {
  buildQueryString,
  clamp,
  dateToSnowflake,
  delay,
  escapeHtml,
  formatDuration,
  snowflakeToDate,
} from './helpers';

export {
  appendMany,
  createBatchUpdater,
  createBoundedArray,
  createCleanupManager,
  createOptimizedObserver,
  debounce,
  lazy,
  type OptimizedObserverOptions,
  scheduleFrame,
  throttle,
  trimChildren,
} from './performance';

export {
  DM_GUILD_ID,
  isValidGuildId,
  isValidSnowflake,
  isValidTokenFormat,
  maskToken,
  type RegexValidationResult,
  validateRegex,
  validateSnowflake,
  validateToken,
} from './validators';
