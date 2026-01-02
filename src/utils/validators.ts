/**
 * Input validation utilities for Detcord
 *
 * Provides validation functions for user input and API parameters
 * to prevent security vulnerabilities like ReDoS and injection attacks.
 */

// =============================================================================
// Constants
// =============================================================================

/** Maximum allowed length for regex patterns */
const MAX_PATTERN_LENGTH = 100;

/** Maximum execution time for regex test (ms) */
const REGEX_TIMEOUT_MS = 100;

/**
 * Patterns that indicate potentially dangerous regex constructs
 * that could cause catastrophic backtracking (ReDoS)
 */
const DANGEROUS_REGEX_PATTERNS = [
  // Nested quantifiers: (a+)+, (a*)*,  (a+)*, etc.
  /\([^)]*[+*][^)]*\)[+*]/,
  // Overlapping same-character alternations with quantifiers: (a|a)+
  /\(([^|)]+)\|\1\)[+*]/,
  // Back-references with quantifiers
  /\\[1-9][+*]/,
];

/**
 * Test string used to detect ReDoS vulnerabilities
 * Contains patterns that trigger exponential backtracking in vulnerable regexes
 */
const REDOS_TEST_STRING = `${'a'.repeat(25)}!`;

// =============================================================================
// Regex Validation
// =============================================================================

/**
 * Result of regex pattern validation
 */
export interface RegexValidationResult {
  /** Whether the pattern is valid and safe to use */
  valid: boolean;
  /** Error message if validation failed */
  error?: string;
  /** The compiled regex if valid */
  regex?: RegExp;
}

/**
 * Validates a regex pattern for safety and correctness.
 *
 * Checks for:
 * - Valid regex syntax
 * - Pattern length limits
 * - Dangerous constructs that could cause ReDoS
 * - Actual execution time on test input
 *
 * @param pattern - The regex pattern string to validate
 * @param flags - Optional regex flags (default: 'i' for case-insensitive)
 * @returns Validation result with compiled regex if valid
 */
export function validateRegex(pattern: string, flags = 'i'): RegexValidationResult {
  // Check for empty pattern
  if (!pattern || pattern.trim().length === 0) {
    return { valid: true }; // Empty pattern is valid (no filtering)
  }

  // Check pattern length
  if (pattern.length > MAX_PATTERN_LENGTH) {
    return {
      valid: false,
      error: `Pattern exceeds maximum length of ${MAX_PATTERN_LENGTH} characters`,
    };
  }

  // Check for dangerous patterns that could cause ReDoS
  for (const dangerous of DANGEROUS_REGEX_PATTERNS) {
    if (dangerous.test(pattern)) {
      return {
        valid: false,
        error: 'Pattern contains constructs that could cause performance issues',
      };
    }
  }

  // Try to compile the regex
  let regex: RegExp;
  try {
    regex = new RegExp(pattern, flags);
  } catch (e) {
    return {
      valid: false,
      error: e instanceof Error ? e.message : 'Invalid regex pattern',
    };
  }

  // Test execution time with a potentially problematic input
  const startTime = performance.now();
  try {
    regex.test(REDOS_TEST_STRING);
  } catch {
    return {
      valid: false,
      error: 'Pattern caused an error during execution',
    };
  }
  const executionTime = performance.now() - startTime;

  if (executionTime > REGEX_TIMEOUT_MS) {
    return {
      valid: false,
      error: 'Pattern takes too long to execute and may cause performance issues',
    };
  }

  return { valid: true, regex };
}

// =============================================================================
// Discord ID Validation
// =============================================================================

/**
 * Discord snowflake ID format:
 * - Numeric string
 * - 17-19 digits (based on Discord epoch and current timestamps)
 * - Represents a 64-bit integer
 */
const SNOWFLAKE_REGEX = /^\d{17,19}$/;

/**
 * Validates a Discord snowflake ID.
 *
 * Discord snowflakes are 64-bit integers encoded as strings.
 * They contain a timestamp, worker ID, process ID, and increment.
 *
 * @param id - The ID string to validate
 * @returns True if the ID is a valid snowflake format
 */
export function isValidSnowflake(id: string): boolean {
  if (!id || typeof id !== 'string') {
    return false;
  }
  return SNOWFLAKE_REGEX.test(id);
}

/**
 * Validates a Discord snowflake ID and returns a result object.
 *
 * @param id - The ID string to validate
 * @param fieldName - Name of the field for error messages
 * @returns Validation result with error message if invalid
 */
export function validateSnowflake(
  id: string,
  fieldName = 'ID',
): { valid: boolean; error?: string } {
  if (!id || typeof id !== 'string') {
    return { valid: false, error: `${fieldName} is required` };
  }

  if (!SNOWFLAKE_REGEX.test(id)) {
    return { valid: false, error: `${fieldName} must be a valid Discord ID (17-19 digits)` };
  }

  return { valid: true };
}

/**
 * Special guild ID for DMs
 */
export const DM_GUILD_ID = '@me';

/**
 * Validates a guild ID, which can be either a snowflake or "@me" for DMs.
 *
 * @param id - The guild ID to validate
 * @returns True if the ID is valid
 */
export function isValidGuildId(id: string): boolean {
  if (!id || typeof id !== 'string') {
    return false;
  }
  return id === DM_GUILD_ID || isValidSnowflake(id);
}

// =============================================================================
// Token Validation
// =============================================================================

/**
 * Discord token format:
 * - Base64-encoded user ID (variable length)
 * - Dot separator
 * - Base64-encoded timestamp (6 characters)
 * - Dot separator
 * - Base64-encoded HMAC (27 characters)
 *
 * Example: "MTIzNDU2Nzg5MDEyMzQ1Njc4.ABcDeF.abcdefghijklmnopqrstuvwxyz1"
 */
const TOKEN_REGEX = /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/;

/** Minimum token length (shortest possible valid token) */
const MIN_TOKEN_LENGTH = 50;

/** Maximum token length (reasonable upper bound) */
const MAX_TOKEN_LENGTH = 100;

/**
 * Validates a Discord authentication token format.
 *
 * Note: This only validates the format, not whether the token is actually valid
 * for authentication. A token can have the correct format but be expired or revoked.
 *
 * @param token - The token string to validate
 * @returns True if the token has a valid format
 */
export function isValidTokenFormat(token: string): boolean {
  if (!token || typeof token !== 'string') {
    return false;
  }

  if (token.length < MIN_TOKEN_LENGTH || token.length > MAX_TOKEN_LENGTH) {
    return false;
  }

  return TOKEN_REGEX.test(token);
}

/**
 * Validates a Discord token and returns a result object.
 *
 * @param token - The token string to validate
 * @returns Validation result with error message if invalid
 */
export function validateToken(token: string): { valid: boolean; error?: string } {
  if (!token || typeof token !== 'string') {
    return { valid: false, error: 'Token is required' };
  }

  if (token.length < MIN_TOKEN_LENGTH) {
    return { valid: false, error: 'Token is too short' };
  }

  if (token.length > MAX_TOKEN_LENGTH) {
    return { valid: false, error: 'Token is too long' };
  }

  if (!TOKEN_REGEX.test(token)) {
    return { valid: false, error: 'Token has invalid format' };
  }

  return { valid: true };
}

/**
 * Masks a token for safe display in logs or UI.
 *
 * @param token - The token to mask
 * @returns Masked token showing only first and last 4 characters
 */
export function maskToken(token: string): string {
  if (!token || token.length < 12) {
    return '****';
  }
  return `${token.slice(0, 4)}...${token.slice(-4)}`;
}
