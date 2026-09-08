/**
 * Tests for validation utilities
 */

import { describe, expect, it } from 'vitest';
import {
  DM_GUILD_ID,
  isValidGuildId,
  isValidSnowflake,
  isValidTokenFormat,
  MAX_REGEX_SUBJECT_LENGTH,
  maskToken,
  safeRegexTest,
  validateRegex,
  validateSnowflake,
  validateToken,
} from './validators';

describe('validateRegex', () => {
  describe('valid patterns', () => {
    it('should accept empty pattern', () => {
      const result = validateRegex('');
      expect(result.valid).toBe(true);
    });

    it('should accept simple literal pattern', () => {
      const result = validateRegex('hello');
      expect(result.valid).toBe(true);
      expect(result.regex).toBeDefined();
    });

    it('should accept basic regex patterns', () => {
      expect(validateRegex('foo.*bar').valid).toBe(true);
      expect(validateRegex('^start').valid).toBe(true);
      expect(validateRegex('end$').valid).toBe(true);
      expect(validateRegex('[a-z]+').valid).toBe(true);
      expect(validateRegex('\\d{3}').valid).toBe(true);
    });

    it('should accept character classes', () => {
      expect(validateRegex('[abc]').valid).toBe(true);
      expect(validateRegex('[^abc]').valid).toBe(true);
      expect(validateRegex('\\w+').valid).toBe(true);
      expect(validateRegex('\\s*').valid).toBe(true);
    });

    it('should return compiled regex for valid patterns', () => {
      const result = validateRegex('test');
      expect(result.regex).toBeInstanceOf(RegExp);
      expect(result.regex?.test('testing')).toBe(true);
    });
  });

  describe('invalid patterns', () => {
    it('should reject patterns exceeding max length', () => {
      const longPattern = 'a'.repeat(101);
      const result = validateRegex(longPattern);
      expect(result.valid).toBe(false);
      expect(result.error).toContain('maximum length');
    });

    it('should reject invalid regex syntax', () => {
      const result = validateRegex('[invalid');
      expect(result.valid).toBe(false);
      expect(result.error).toBeDefined();
    });

    it('should reject unbalanced parentheses', () => {
      const result = validateRegex('(unclosed');
      expect(result.valid).toBe(false);
    });
  });

  describe('ReDoS protection', () => {
    it('should reject nested quantifiers (a+)+', () => {
      const result = validateRegex('(a+)+');
      expect(result.valid).toBe(false);
      expect(result.error).toContain('performance');
    });

    it('should reject nested quantifiers (a*)*', () => {
      const result = validateRegex('(a*)*');
      expect(result.valid).toBe(false);
    });

    it('should reject overlapping alternation with quantifier', () => {
      const result = validateRegex('(a|a)+');
      expect(result.valid).toBe(false);
    });

    it.each([
      ['^(a|aa)+$', 'quantified alternation with a prefix-overlapping branch'],
      ['^(b|bb)+$', 'the same shape built from another character'],
      ['(a|ab)*c', 'quantified alternation followed by a literal'],
      ['(\\w+\\s?)*$', 'quantified group containing quantifiers'],
      ['(?:x+)+y', 'non-capturing group with a quantified body'],
      ['(a+){2,}', 'open-ended brace quantifier over a quantified body'],
      ['((a|b)c)+', 'alternation nested one level inside a repeated group'],
    ])('should reject %s (%s)', (pattern) => {
      const result = validateRegex(pattern);
      expect(result.valid).toBe(false);
      expect(result.error).toContain('performance');
    });

    it.each([
      ['^(a|aa){1,100}$', 'bounded repetition of an ambiguous alternation'],
      ['^.{50}(a|aa){1,100}$', 'the same, hidden behind a fixed-length prefix'],
      ['(a+){2}', 'exact repetition of a quantified body'],
      ['(?:x+){3,5}', 'bounded repetition of a quantified non-capturing group'],
      ['(a|ab){2,}', 'open-ended repetition of an alternation'],
    ])('should reject %s (%s)', (pattern) => {
      // Bounded repetition backtracks just as catastrophically as `+`:
      // `^.{50}(a|aa){1,100}$` took over a second on a 151-character subject.
      const result = validateRegex(pattern);
      expect(result.valid).toBe(false);
      expect(result.error).toContain('performance');
    });

    it.each(['(cat|dog)?', '(cat|dog){1}', '(foo|bar)\\d{3}', 'https?://\\S+'])(
      'should accept the bounded-safe pattern %s',
      (pattern) => {
        // `?`, `{0,1}` and `{1}` cannot apply a group twice, so an alternation
        // under them is not ambiguous.
        expect(validateRegex(pattern).valid).toBe(true);
      },
    );

    it('should reject a quantified alternation quickly rather than by timing out', () => {
      // The pattern is the reproduction case: matching 38 "a"s against it took
      // ~690ms before this check existed. Rejection must be structural.
      const start = performance.now();
      const result = validateRegex('^(a|aa)+$');
      const elapsed = performance.now() - start;

      expect(result.valid).toBe(false);
      expect(elapsed).toBeLessThan(50);
    });

    it('should reject bounded ambiguous repetition without executing it', () => {
      // `^(a|aa){1,100}$` slipped past the scanner and hung the probe instead.
      const start = performance.now();
      const result = validateRegex('^(a|aa){1,100}$');
      const elapsed = performance.now() - start;

      expect(result.valid).toBe(false);
      expect(result.error).toContain('performance');
      expect(elapsed).toBeLessThan(50);
    });

    it.each(['^(cat|dog)$', '\\bhello\\b', 'https?://\\S+', '(foo|bar)\\d{3}'])(
      'should accept the safe pattern %s',
      (pattern) => {
        const result = validateRegex(pattern);
        expect(result.valid).toBe(true);
        expect(result.regex).toBeInstanceOf(RegExp);
      },
    );

    it('should accept safe quantified constructs', () => {
      // Single quantifier
      expect(validateRegex('a+').valid).toBe(true);
      // Fixed repetition of a plain group
      expect(validateRegex('(abc){3}').valid).toBe(true);
      // Non-capturing group with a plain body
      expect(validateRegex('(?:abc)+').valid).toBe(true);
    });

    it('should reject a quantified alternation even when the branches are disjoint', () => {
      // Changed assertion: `(a|b)+` was previously accepted. Proving that two
      // branches can never match the same input needs full automata analysis,
      // so every repeated alternation is now refused. `[ab]+` expresses the
      // safe intent without backtracking.
      expect(validateRegex('(a|b)+').valid).toBe(false);
      expect(validateRegex('[ab]+').valid).toBe(true);
    });

    it('should treat | inside a character class as a literal', () => {
      expect(validateRegex('([a|b])+').valid).toBe(true);
    });

    it('should treat an escaped | as a literal', () => {
      expect(validateRegex('(a\\|b)+').valid).toBe(true);
    });

    it('should see through lookaround and named-group prefixes', () => {
      expect(validateRegex('(?<=foo)(a|b)+').valid).toBe(false);
      expect(validateRegex('(?<!foo)(x+)+').valid).toBe(false);
      expect(validateRegex('(?<word>a|b)+').valid).toBe(false);
      expect(validateRegex('(?=abc)(a+)+').valid).toBe(false);
    });

    it('should not mistake a group prefix for a quantifier in the body', () => {
      expect(validateRegex('(?<word>abc)+').valid).toBe(true);
      expect(validateRegex('(?=abc)def').valid).toBe(true);
    });

    it('should treat a brace that is not a quantifier as a literal', () => {
      expect(validateRegex('(a{x})+').valid).toBe(true);
      expect(validateRegex('(a{2,3})+').valid).toBe(false);
    });

    it('should handle a character class containing a closing bracket', () => {
      expect(validateRegex('([\\]a])+').valid).toBe(true);
      expect(validateRegex('([^a])+').valid).toBe(true);
    });

    it('should tolerate an unterminated character class', () => {
      const result = validateRegex('(a[bc)+');
      expect(result.valid).toBe(false);
      expect(result.error).toBeDefined();
    });

    it('should allow an unquantified group containing alternation and quantifiers', () => {
      expect(validateRegex('(a+|b+)').valid).toBe(true);
    });

    it('should reject a slow pattern that survives the structural check', () => {
      // No quantified group, but the derived probe "aaaa…a!" forces the engine
      // through every split of the run before failing.
      const result = validateRegex('^a*a*a*a*a*a*b$');
      expect(result.valid).toBe(false);
      expect(result.error).toContain('too long');
    });
  });

  describe('safeRegexTest', () => {
    it('should match within the length limit', () => {
      expect(safeRegexTest(/hello/i, 'say hello there')).toBe(true);
      expect(safeRegexTest(/hello/i, 'nothing here')).toBe(false);
    });

    it('should truncate the subject to MAX_REGEX_SUBJECT_LENGTH', () => {
      const text = `${'x'.repeat(MAX_REGEX_SUBJECT_LENGTH)}needle`;

      expect(safeRegexTest(/needle/, text)).toBe(false);
      expect(/needle/.test(text)).toBe(true);
    });

    it('should still match content that falls inside the limit', () => {
      const text = `needle${'x'.repeat(MAX_REGEX_SUBJECT_LENGTH * 2)}`;

      expect(safeRegexTest(/needle/, text)).toBe(true);
    });

    it('should reset lastIndex so a global regex stays stateless', () => {
      const regex = /a/g;

      expect(safeRegexTest(regex, 'a')).toBe(true);
      expect(safeRegexTest(regex, 'a')).toBe(true);
    });

    it('should return false for non-string input', () => {
      expect(safeRegexTest(/anything/, null as unknown as string)).toBe(false);
    });

    it('should expose a bound large enough for any Discord message', () => {
      expect(MAX_REGEX_SUBJECT_LENGTH).toBe(4000);
    });
  });

  describe('flags', () => {
    it('should use case-insensitive flag by default', () => {
      const result = validateRegex('ABC');
      expect(result.regex?.flags).toBe('i');
      expect(result.regex?.test('abc')).toBe(true);
    });

    it('should accept custom flags', () => {
      const result = validateRegex('abc', 'g');
      expect(result.regex?.flags).toBe('g');
    });
  });
});

describe('isValidSnowflake', () => {
  it('should accept valid snowflake IDs', () => {
    expect(isValidSnowflake('123456789012345678')).toBe(true);
    expect(isValidSnowflake('1234567890123456789')).toBe(true);
    expect(isValidSnowflake('12345678901234567')).toBe(true);
  });

  it('should reject IDs that are too short', () => {
    expect(isValidSnowflake('1234567890123456')).toBe(false);
    expect(isValidSnowflake('123')).toBe(false);
  });

  it('should reject IDs that are too long', () => {
    expect(isValidSnowflake('12345678901234567890')).toBe(false);
  });

  it('should reject non-numeric IDs', () => {
    expect(isValidSnowflake('12345678901234567a')).toBe(false);
    expect(isValidSnowflake('abcdefghijklmnopqr')).toBe(false);
  });

  it('should reject empty or null values', () => {
    expect(isValidSnowflake('')).toBe(false);
    expect(isValidSnowflake(null as unknown as string)).toBe(false);
    expect(isValidSnowflake(undefined as unknown as string)).toBe(false);
  });

  it('should reject non-string values', () => {
    // Using BigInt to avoid precision loss with large numbers
    expect(isValidSnowflake(BigInt('123456789012345678') as unknown as string)).toBe(false);
  });
});

describe('validateSnowflake', () => {
  it('should return valid for correct snowflakes', () => {
    const result = validateSnowflake('123456789012345678');
    expect(result.valid).toBe(true);
    expect(result.error).toBeUndefined();
  });

  it('should return error for invalid snowflakes', () => {
    const result = validateSnowflake('invalid');
    expect(result.valid).toBe(false);
    expect(result.error).toContain('valid Discord ID');
  });

  it('should include field name in error message', () => {
    const result = validateSnowflake('invalid', 'Channel ID');
    expect(result.error).toContain('Channel ID');
  });

  it('should return error for missing value', () => {
    const result = validateSnowflake('');
    expect(result.valid).toBe(false);
    expect(result.error).toContain('required');
  });
});

describe('isValidGuildId', () => {
  it('should accept valid snowflake IDs', () => {
    expect(isValidGuildId('123456789012345678')).toBe(true);
  });

  it('should accept @me for DMs', () => {
    expect(isValidGuildId('@me')).toBe(true);
    expect(isValidGuildId(DM_GUILD_ID)).toBe(true);
  });

  it('should reject invalid IDs', () => {
    expect(isValidGuildId('invalid')).toBe(false);
    expect(isValidGuildId('@you')).toBe(false);
    expect(isValidGuildId('')).toBe(false);
  });
});

describe('isValidTokenFormat', () => {
  it('should accept valid token format', () => {
    // Mock token with correct structure (not a real token)
    const mockToken = 'MTIzNDU2Nzg5MDEyMzQ1Njc4.XYZabc.abcdefghijklmnopqrstuvwxyz1';
    expect(isValidTokenFormat(mockToken)).toBe(true);
  });

  it('should reject tokens that are too short', () => {
    expect(isValidTokenFormat('short.token.here')).toBe(false);
  });

  it('should reject tokens that are too long', () => {
    const longToken = `${'a'.repeat(50)}.${'b'.repeat(30)}.${'c'.repeat(30)}`;
    expect(isValidTokenFormat(longToken)).toBe(false);
  });

  it('should reject tokens without proper structure', () => {
    expect(isValidTokenFormat('notokenformathere')).toBe(false);
    expect(isValidTokenFormat('only.two.parts.here.extra')).toBe(false);
  });

  it('should reject tokens with invalid characters', () => {
    expect(isValidTokenFormat('invalid token with spaces.abc.def')).toBe(false);
  });

  it('should reject empty or null values', () => {
    expect(isValidTokenFormat('')).toBe(false);
    expect(isValidTokenFormat(null as unknown as string)).toBe(false);
    expect(isValidTokenFormat(undefined as unknown as string)).toBe(false);
  });
});

describe('validateToken', () => {
  const validToken = 'MTIzNDU2Nzg5MDEyMzQ1Njc4.XYZabc.abcdefghijklmnopqrstuvwxyz1';

  it('should return valid for correct token format', () => {
    const result = validateToken(validToken);
    expect(result.valid).toBe(true);
    expect(result.error).toBeUndefined();
  });

  it('should return error for missing token', () => {
    const result = validateToken('');
    expect(result.valid).toBe(false);
    expect(result.error).toContain('required');
  });

  it('should return error for short token', () => {
    const result = validateToken('short.a.b');
    expect(result.valid).toBe(false);
    expect(result.error).toContain('short');
  });

  it('should return error for invalid format', () => {
    const result = validateToken('a'.repeat(60));
    expect(result.valid).toBe(false);
    expect(result.error).toContain('invalid format');
  });
});

describe('maskToken', () => {
  it('should mask token showing first and last 4 characters', () => {
    const token = 'MTIzNDU2Nzg5MDEyMzQ1Njc4.XYZabc.abcdefghijklmnopqrstuvwxyz1';
    const masked = maskToken(token);
    expect(masked).toBe('MTIz...xyz1');
  });

  it('should return **** for short tokens', () => {
    expect(maskToken('short')).toBe('****');
    expect(maskToken('')).toBe('****');
  });

  it('should handle null/undefined gracefully', () => {
    expect(maskToken(null as unknown as string)).toBe('****');
    expect(maskToken(undefined as unknown as string)).toBe('****');
  });
});
