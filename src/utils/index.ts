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
  parseLocalDateEnd,
  parseLocalDateStart,
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
  MAX_REGEX_SUBJECT_LENGTH,
  maskToken,
  type RegexValidationResult,
  safeRegexTest,
  validateRegex,
  validateSnowflake,
  validateToken,
} from './validators';
