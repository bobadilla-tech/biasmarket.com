import { toPublicCustomerAlias } from './public-order-alias.js';

describe('toPublicCustomerAlias', () => {
  it('returns null for empty input', () => {
    expect(toPublicCustomerAlias(null)).toBeNull();
    expect(toPublicCustomerAlias('')).toBeNull();
    expect(toPublicCustomerAlias(' \t\n  ')).toBeNull();
  });

  it('keeps a normal name and trims it', () => {
    expect(toPublicCustomerAlias('  Sofi Lee ')).toBe('Sofi Lee');
  });

  it('collapses tabs and newlines to single spaces before stripping', () => {
    expect(toPublicCustomerAlias('a\tb\nc')).toBe('a b c');
    expect(toPublicCustomerAlias('a \r\n  b')).toBe('a b');
  });

  it('removes NUL, bidi marks/overrides and zero-width characters', () => {
    expect(toPublicCustomerAlias('So\u0000fi')).toBe('Sofi');
    expect(toPublicCustomerAlias('\u202Eevil\u202C')).toBe('evil');
    expect(toPublicCustomerAlias('\u200Ea\u200Fb\u2066c\u2069')).toBe('abc');
    expect(toPublicCustomerAlias('a\u200Bb\uFEFFc')).toBe('abc');
  });

  it('replaces a lone surrogate with U+FFFD', () => {
    expect(toPublicCustomerAlias('a\uD800b')).toBe('a�b');
  });

  it('keeps ZWJ sequences intact', () => {
    expect(toPublicCustomerAlias('👨\u200D👩\u200D👧')).toBe(
      '👨\u200D👩\u200D👧',
    );
  });

  it('cuts to 40 graphemes without splitting an emoji', () => {
    const result = toPublicCustomerAlias('a'.repeat(39) + '🎉🎉');
    expect(result).toBe('a'.repeat(39) + '🎉');
  });

  it('does not leave a dangling ZWJ after a family emoji at the cut', () => {
    const family = '👨\u200D👩\u200D👧';
    const result = toPublicCustomerAlias('a'.repeat(39) + family + 'z');
    expect(result).toBe('a'.repeat(39) + family);
    expect(result!.endsWith('\u200D')).toBe(false);
  });

  it('returns null when only stripped characters remain', () => {
    expect(toPublicCustomerAlias('\u200B\u202E\u0000')).toBeNull();
  });

  it('returns null for names made only of invisible characters', () => {
    for (const blank of [
      '\u2060',
      '\u00AD',
      '\u3164',
      '\u2800',
      '\u200D',
      '\uFE0F',
    ]) {
      expect(toPublicCustomerAlias(blank)).toBeNull();
    }
  });

  it('keeps multilingual names and emoji', () => {
    expect(toPublicCustomerAlias('민지')).toBe('민지');
    expect(toPublicCustomerAlias('🎉')).toBe('🎉');
  });
});
