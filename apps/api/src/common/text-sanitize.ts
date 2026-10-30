const FORBIDDEN_CODE_CHARS = /[\p{Cc}\p{Cf}\p{Zl}\p{Zp}]/u;
const WHITESPACE_RUNS = /[\s\p{Zl}\p{Zp}]+/gu;
// Bidi controls, zero-width/invisible format characters and the tag block.
// U+200D (ZWJ) is deliberately kept so emoji sequences survive.
const DANGEROUS_FORMAT_CHARS =
  /[\u202A-\u202E\u2066-\u2069\u200E\u200F\u061C\u200B\u2060\uFEFF\u00AD\u{E0000}-\u{E007F}]/gu;
const CONTROL_CHARS = /\p{Cc}/gu;
const TRAILING_ZWJ = /\u200D+$/u;

/**
 * Canonical form of an operation code for duplicate comparison: NFKC, every
 * non-`[A-Za-z0-9]` removed, uppercased. An empty result is invalid input.
 */
export function normalizeOperationCode(value: string): string {
  return value
    .normalize('NFKC')
    .replace(/[^A-Za-z0-9]/g, '')
    .toUpperCase();
}

/**
 * Raw operation-code input that must be rejected before normalization:
 * control, format and line/paragraph separator characters.
 */
export function hasForbiddenChars(value: string): boolean {
  return FORBIDDEN_CODE_CHARS.test(value);
}

/**
 * Only function to use when persisting an operation code. NFKC makes a
 * fullwidth "ＡＢＣ１" be stored as ASCII so the ASCII-only SQL comparison
 * finds it.
 */
export function normalizeOperationCodeForStorage(value: string): string {
  return value.normalize('NFKC').trim();
}

/** NFC + trim, for display text only. */
export function normalizeText(value: string): string {
  return value.normalize('NFC').trim();
}

/**
 * Makes free text safe to show on a public page or store in audit metadata:
 * NFC (not NFKC), whitespace runs collapsed, control and dangerous format
 * characters stripped, truncated by code points. `null` when nothing is left.
 */
export function sanitizeDisplayText(
  value: string | null | undefined,
  max = 500,
): string | null {
  if (value == null) return null;
  const collapsed = value
    .slice(0, max * 4)
    .normalize('NFC')
    // Format characters first: JS `\s` treats U+FEFF as whitespace.
    .replace(DANGEROUS_FORMAT_CHARS, '')
    .replace(WHITESPACE_RUNS, ' ')
    .replace(CONTROL_CHARS, '');
  const cut = Array.from(collapsed).slice(0, max).join('');
  const result = cut.replace(TRAILING_ZWJ, '').trim();
  return result === '' ? null : result;
}

export const MAX_NOTE_LENGTH = 500;
export const NOTE_TOO_LONG_MESSAGE = 'La nota no puede superar 500 caracteres';

/** Counts code points, the same unit `sanitizeDisplayText` truncates by. */
export function isNoteTooLong(note: unknown): boolean {
  return typeof note === 'string' && Array.from(note).length > MAX_NOTE_LENGTH;
}
