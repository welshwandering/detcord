/**
 * Tests for validation utilities
 */

import { describe, expect, it } from 'vitest';
import {
  DM_GUILD_ID,
  isValidGuildId,
  isValidSnowflake,
  isValidTokenFormat,
  maskToken,
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

    it('should accept safe quantified groups', () => {
      // Non-overlapping alternation
      expect(validateRegex('(a|b)+').valid).toBe(true);
      // Single quantifier
      expect(validateRegex('a+').valid).toBe(true);
      // Fixed repetition
      expect(validateRegex('(abc){3}').valid).toBe(true);
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
