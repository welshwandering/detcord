/**
 * Utility functions for Detcord
 */

export {
  dateToSnowflake,
  snowflakeToDate,
  formatDuration,
  escapeHtml,
  buildQueryString,
  delay,
  clamp,
} from './helpers';

export {
  throttle,
  debounce,
  scheduleFrame,
  createBatchUpdater,
  createBoundedArray,
  createCleanupManager,
  appendMany,
  trimChildren,
  lazy,
  createOptimizedObserver,
  type OptimizedObserverOptions,
} from './performance';

export {
  validateRegex,
  isValidSnowflake,
  validateSnowflake,
  isValidGuildId,
  isValidTokenFormat,
  validateToken,
  maskToken,
  DM_GUILD_ID,
  type RegexValidationResult,
} from './validators';
