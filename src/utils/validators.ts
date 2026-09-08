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

/**
 * Maximum time a single probe may take before the pattern is rejected (ms).
 *
 * Catastrophic backtracking doubles with each extra input character, so a safe
 * pattern finishes a 41-character probe in well under a millisecond while a
 * vulnerable one blows straight past this budget.
 */
const REGEX_PROBE_BUDGET_MS = 20;

/**
 * Maximum length of text `safeRegexTest` will hand to a regex engine.
 * Discord messages cap out well below this, so truncation costs nothing real
 * while bounding the work a merely-slow pattern can do.
 */
export const MAX_REGEX_SUBJECT_LENGTH = 4000;

/** Length of the repeated-character prefix used for adversarial probes. */
const PROBE_REPEAT_COUNT = 40;

/** Upper bound on how many pattern-derived probe strings are built. */
const MAX_DERIVED_PROBES = 6;

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
// Catastrophic backtracking detection
// =============================================================================

/**
 * How often a quantifier can repeat what precedes it.
 *
 * `atMostOne` covers `?`, `{0,1}` and `{1}`: they cannot make a group match the
 * same input in two ways, so they are harmless. Everything that can repeat more
 * than once — including bounded forms such as `{1,100}` — is `repeating`.
 */
type QuantifierKind = 'none' | 'atMostOne' | 'repeating';

/** What has been seen inside the group currently being scanned. */
interface GroupContents {
  alternation: boolean;
  quantifier: boolean;
}

/**
 * Returns the index just past a character class starting at `start`.
 *
 * JavaScript, unlike POSIX, has no "leading `]` is literal" rule: `[]` is an
 * empty class and `[^]` a negated one, so the first unescaped `]` closes.
 */
function skipCharacterClass(pattern: string, start: number): number {
  let index = start + 1;
  if (pattern[index] === '^') {
    index += 1;
  }
  while (index < pattern.length) {
    const char = pattern[index];
    if (char === '\\') {
      index += 2;
      continue;
    }
    if (char === ']') {
      return index + 1;
    }
    index += 1;
  }
  return pattern.length;
}

/**
 * Returns the index just past a group's prefix — `?:`, `?=`, `?!`, `?<=`,
 * `?<!` or `?<name>` — so the prefix is not mistaken for group contents.
 *
 * @param pattern - The full pattern
 * @param start - Index of the character following `(`
 */
function skipGroupPrefix(pattern: string, start: number): number {
  if (pattern[start] !== '?') {
    return start;
  }
  const next = pattern[start + 1];
  if (next === ':' || next === '=' || next === '!') {
    return start + 2;
  }
  if (next === '<') {
    const after = pattern[start + 2];
    if (after === '=' || after === '!') {
      return start + 3;
    }
    const close = pattern.indexOf('>', start + 2);
    return close === -1 ? start + 2 : close + 1;
  }
  return start + 1;
}

/** Matches a `{n}`, `{n,}` or `{n,m}` quantifier at the start of a slice. */
const BRACE_QUANTIFIER = /^\{(\d+)(,(\d*))?\}/;

/**
 * Whether a brace quantifier can apply what precedes it more than once.
 *
 * `{n}` repeats when `n > 1`, `{n,}` always repeats, and `{n,m}` repeats when
 * `m > 1`. `{1}`, `{0,1}` and `{1,1}` cannot.
 *
 * @param match - A successful {@link BRACE_QUANTIFIER} match
 */
function braceRepeats(match: RegExpExecArray): boolean {
  const minimum = Number.parseInt(match[1] ?? '0', 10);
  if (match[2] === undefined) {
    return minimum > 1;
  }
  const maximum = match[3];
  return !maximum || Number.parseInt(maximum, 10) > 1;
}

/**
 * Classifies the quantifier (if any) starting at `index`.
 */
function quantifierAt(pattern: string, index: number): QuantifierKind {
  const char = pattern[index];
  if (char === '+' || char === '*') {
    return 'repeating';
  }
  if (char === '?') {
    return 'atMostOne';
  }
  if (char !== '{') {
    return 'none';
  }
  const match = BRACE_QUANTIFIER.exec(pattern.slice(index));
  if (!match) {
    return 'none';
  }
  return braceRepeats(match) ? 'repeating' : 'atMostOne';
}

/** Mutable state carried through a single pattern scan. */
interface ScanState {
  /** Groups enclosing the one currently being scanned. */
  stack: GroupContents[];
  /** Contents seen so far in the innermost open group. */
  current: GroupContents;
  /** Set once a catastrophic shape has been found. */
  risky: boolean;
}

/** A fresh, empty record of group contents. */
function emptyGroup(): GroupContents {
  return { alternation: false, quantifier: false };
}

/**
 * Closes the innermost group, flagging the pattern when that group can repeat
 * more than once over an ambiguous body, and folding what it contained into
 * its parent.
 */
function closeGroup(state: ScanState, pattern: string, index: number): void {
  const repeats = quantifierAt(pattern, index + 1) === 'repeating';
  if (repeats && (state.current.alternation || state.current.quantifier)) {
    state.risky = true;
  }
  const parent = state.stack.pop() ?? emptyGroup();
  parent.alternation = parent.alternation || state.current.alternation;
  parent.quantifier = parent.quantifier || state.current.quantifier;
  state.current = parent;
}

/**
 * Consumes one syntactic unit of the pattern, updating `state`.
 *
 * @returns The index to continue scanning from
 */
function scanStep(pattern: string, index: number, state: ScanState): number {
  const char = pattern[index];

  if (char === '\\') {
    return index + 2;
  }
  if (char === '[') {
    return skipCharacterClass(pattern, index);
  }
  if (char === '(') {
    state.stack.push(state.current);
    state.current = emptyGroup();
    return skipGroupPrefix(pattern, index + 1);
  }
  if (char === ')') {
    closeGroup(state, pattern, index);
    return index + 1;
  }
  if (char === '|') {
    state.current.alternation = true;
    return index + 1;
  }
  if (quantifierAt(pattern, index) !== 'none') {
    state.current.quantifier = true;
  }
  return index + 1;
}

/**
 * Detects a quantified group whose body can match the same input in more than
 * one way — the shape behind catastrophic backtracking.
 *
 * A group is dangerous when its body contains an alternation (`(a|aa)`) or
 * another quantifier (`(a+)`, `(?:x+)`) and the group itself is repeated by a
 * quantifier that can apply more than once. That includes bounded forms:
 * `^(a|aa){1,100}$` backtracks just as catastrophically as `^(a|aa)+$`. Only
 * `?`, `{0,1}` and `{1}` leave such a group safe.
 *
 * Deciding whether the alternatives genuinely overlap needs full automata
 * analysis, so every repeated alternation is refused.
 *
 * @param pattern - The regex source to inspect
 * @returns True when the pattern contains such a group
 */
function hasRiskyQuantifiedGroup(pattern: string): boolean {
  const state: ScanState = { stack: [], current: emptyGroup(), risky: false };
  let index = 0;

  while (index < pattern.length && !state.risky) {
    index = scanStep(pattern, index, state);
  }

  return state.risky;
}

/**
 * Builds adversarial probe strings from the literal characters in a pattern.
 *
 * A generic run of `a`s only stresses patterns built from `a`; deriving the
 * repeated character from the pattern itself makes the probe relevant to
 * whatever the user actually typed.
 */
function buildProbeStrings(pattern: string): string[] {
  const literals = pattern.replace(/\\./g, '');
  const seen: string[] = [];
  for (const char of literals) {
    if (/[A-Za-z0-9]/.test(char) && !seen.includes(char)) {
      seen.push(char);
      if (seen.length >= MAX_DERIVED_PROBES) {
        break;
      }
    }
  }
  return [...seen.map((char) => `${char.repeat(PROBE_REPEAT_COUNT)}!`), REDOS_TEST_STRING];
}

/**
 * Times a single `test` call, retrying once so first-run compilation and JIT
 * warm-up are not mistaken for backtracking.
 *
 * @returns The best (lowest) observed duration in milliseconds
 */
function timeRegexTest(regex: RegExp, subject: string): number {
  const first = performance.now();
  regex.lastIndex = 0;
  regex.test(subject);
  const firstElapsed = performance.now() - first;
  if (firstElapsed <= REGEX_PROBE_BUDGET_MS) {
    return firstElapsed;
  }

  const second = performance.now();
  regex.lastIndex = 0;
  regex.test(subject);
  return Math.min(firstElapsed, performance.now() - second);
}

/**
 * Runs every probe against the compiled pattern.
 *
 * @returns True when a probe stayed within the time budget throughout
 */
function survivesProbes(regex: RegExp, pattern: string): boolean {
  for (const subject of buildProbeStrings(pattern)) {
    if (timeRegexTest(regex, subject) > REGEX_PROBE_BUDGET_MS) {
      return false;
    }
  }
  return true;
}

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
 * - Quantified groups that can cause catastrophic backtracking
 * - Actual execution time against adversarial input derived from the pattern
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

  if (hasRiskyQuantifiedGroup(pattern)) {
    return {
      valid: false,
      error: 'Pattern contains a repeated group that could cause performance issues',
    };
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

  // Probe execution time with adversarial input built from the pattern itself
  let safe: boolean;
  try {
    safe = survivesProbes(regex, pattern);
  } catch {
    return {
      valid: false,
      error: 'Pattern caused an error during execution',
    };
  }

  if (!safe) {
    return {
      valid: false,
      error: 'Pattern takes too long to execute and may cause performance issues',
    };
  }

  return { valid: true, regex };
}

/**
 * Tests a regex against text with a bounded subject length.
 *
 * Validation cannot prove a pattern is linear, so every match performed on
 * untrusted message content goes through here: the subject is truncated to
 * `MAX_REGEX_SUBJECT_LENGTH`, which caps the work a merely-slow pattern can do.
 *
 * @param regex - The compiled pattern to test with
 * @param text - The text to test; longer input is truncated, not rejected
 * @returns True when the pattern matches the (possibly truncated) text
 */
export function safeRegexTest(regex: RegExp, text: string): boolean {
  if (typeof text !== 'string') {
    return false;
  }
  const subject =
    text.length > MAX_REGEX_SUBJECT_LENGTH ? text.slice(0, MAX_REGEX_SUBJECT_LENGTH) : text;
  regex.lastIndex = 0;
  return regex.test(subject);
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
