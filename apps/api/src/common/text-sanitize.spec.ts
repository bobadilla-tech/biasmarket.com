import { describe, expect, it } from 'vitest';
import {
  hasForbiddenChars,
  isNoteTooLong,
  normalizeOperationCode,
  normalizeOperationCodeForStorage,
  normalizeText,
  sanitizeDisplayText,
} from './text-sanitize.js';

describe('normalizeOperationCode', () => {
  it('uppercases and strips spaces and dashes', () => {
    expect(normalizeOperationCode(' op-123 45 ')).toBe('OP12345');
  });

  it('folds fullwidth characters through NFKC', () => {
    expect(normalizeOperationCode('ＡＢＣ１')).toBe('ABC1');
  });

  it('strips accented letters instead of keeping them', () => {
    expect(normalizeOperationCode('CAFÉ-1')).toBe('CAF1');
  });

  it('strips zero-width characters', () => {
    expect(normalizeOperationCode('AB​C')).toBe('ABC');
  });

  it('returns an empty string for symbol-only or non-ASCII-only input', () => {
    expect(normalizeOperationCode('---')).toBe('');
    expect(normalizeOperationCode('ÁÉ')).toBe('');
  });
});

describe('normalizeOperationCodeForStorage', () => {
  it('applies NFKC and trims without stripping separators', () => {
    expect(normalizeOperationCodeForStorage('  ＡＢＣ１-x ')).toBe('ABC1-x');
  });

  it('stores a fullwidth input so an ASCII lookup matches it', () => {
    expect(
      normalizeOperationCode(normalizeOperationCodeForStorage('ＡＢＣ１')),
    ).toBe(normalizeOperationCode('abc1'));
  });
});

describe('hasForbiddenChars', () => {
  it.each([
    ['NUL', 'AB\u0000C'],
    ['newline', 'AB\nC'],
    ['DEL', 'AB\u007fC'],
    ['zero-width space (Cf)', 'AB​C'],
    ['bidi override (Cf)', 'AB‮C'],
    ['line separator (Zl)', 'AB C'],
    ['paragraph separator (Zp)', 'AB C'],
  ])('flags %s', (_name, input) => {
    expect(hasForbiddenChars(input)).toBe(true);
  });

  it('accepts plain codes', () => {
    expect(hasForbiddenChars('OP-123 456')).toBe(false);
  });
});

describe('normalizeText', () => {
  it('applies NFC and trims', () => {
    expect(normalizeText('  é  ')).toBe('é');
  });

  it('does not apply NFKC', () => {
    expect(normalizeText('½')).toBe('½');
  });
});

describe('sanitizeDisplayText', () => {
  it('turns newlines and tabs into single spaces', () => {
    expect(sanitizeDisplayText('Sin stock\nContacta')).toBe(
      'Sin stock Contacta',
    );
    expect(sanitizeDisplayText('a\t\r\n b')).toBe('a b');
  });

  it('keeps NFC-safe symbols that NFKC would change', () => {
    expect(sanitizeDisplayText('½ m² …')).toBe('½ m² …');
  });

  it('strips bidi overrides and isolates', () => {
    expect(sanitizeDisplayText('a‮b⁦c⁩d')).toBe('abcd');
    expect(sanitizeDisplayText('a‎b‏c؜d')).toBe('abcd');
  });

  it('strips zero-width, word joiner, BOM, soft hyphen and tag chars', () => {
    expect(sanitizeDisplayText('a​b⁠c﻿d­e')).toBe('abcde');
    expect(sanitizeDisplayText('a\u{e0041}b')).toBe('ab');
  });

  it('strips C0 control characters', () => {
    expect(sanitizeDisplayText('a\u0000b\u0007c')).toBe('abc');
  });

  it('keeps ZWJ emoji sequences', () => {
    const family = '👨‍👩‍👧';
    expect(sanitizeDisplayText(family)).toBe(family);
  });

  it('strips a trailing ZWJ left by the cut', () => {
    const out = sanitizeDisplayText('ab👨‍👩', 3);
    expect(out).toBe('ab👨');
  });

  it('truncates by code points, not UTF-16 units', () => {
    expect(sanitizeDisplayText('😀😀😀', 2)).toBe('😀😀');
  });

  it('defaults to 500 code points', () => {
    expect(Array.from(sanitizeDisplayText('x'.repeat(600))!)).toHaveLength(500);
  });

  it('bounds work on oversized input', () => {
    const out = sanitizeDisplayText(' '.repeat(10_000) + 'x', 5);
    expect(out).toBeNull();
  });

  it('returns null when nothing is left', () => {
    expect(sanitizeDisplayText('   ')).toBeNull();
    expect(sanitizeDisplayText('‮​')).toBeNull();
    expect(sanitizeDisplayText('')).toBeNull();
  });

  it('returns null for nullish input', () => {
    expect(sanitizeDisplayText(null)).toBeNull();
    expect(sanitizeDisplayText(undefined)).toBeNull();
  });
});

describe('isNoteTooLong', () => {
  it('allows exactly 500 code points, including astral ones', () => {
    expect(isNoteTooLong('x'.repeat(500))).toBe(false);
    expect(isNoteTooLong('\u{1F600}'.repeat(500))).toBe(false);
  });

  it('rejects 501 code points', () => {
    expect(isNoteTooLong('x'.repeat(501))).toBe(true);
  });

  it('ignores non-strings', () => {
    expect(isNoteTooLong(undefined)).toBe(false);
  });
});
