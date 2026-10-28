const MAX_ALIAS_GRAPHEMES = 40;

// Control characters, zero-width space, bidi marks and
// overrides, line/paragraph separators, BOM, word joiner/invisible operators,
// soft hyphen and blank fillers (Hangul filler, braille blank). ZWJ/ZWNJ are kept on
// purpose: stripping all of \p{Cf} breaks emoji sequences and Persian/Indic text.
const STRIPPED = new RegExp(
  '[\\p{Cc}\\u200B\\u200E\\u200F\\u061C\\u202A-\\u202E\\u2066-\\u2069\\u2028\\u2029\\uFEFF\\u2060-\\u2064\\u00AD\\u180E\\u034F\\uFFFC\\uFFF9-\\uFFFB\\u3164\\u115F\\u1160\\u2800]',
  'gu',
);

const segmenter = new Intl.Segmenter(undefined, { granularity: 'grapheme' });

// `Order.customerName` is seller-typed free text that ends up on a page the
// buyer (or whoever holds the forwarded link) reads. Normalise it to a short,
// single-line, well-formed string; the web renders it as inert text.
export function toPublicCustomerAlias(name: string | null): string | null {
  if (!name) return null;
  const cleaned = name
    // In `u` mode `\p{Surrogate}` only matches lone surrogates.
    .replace(/\p{Surrogate}/gu, '\uFFFD')
    .normalize('NFC')
    // JS `\s` matches the BOM, so drop it before it turns into a space.
    .replace(/\uFEFF/g, '')
    // Collapse whitespace first, otherwise "a\tb\nc" would lose its separators
    // when the control characters are removed below.
    .replace(/\s+/g, ' ')
    .replace(STRIPPED, '')
    .trim();
  // Marks and variation selectors alone render as nothing.
  if (!/[\p{L}\p{N}\p{S}\p{P}]/u.test(cleaned)) return null;
  const graphemes = Array.from(segmenter.segment(cleaned), (s) => s.segment);
  const cut = graphemes.slice(0, MAX_ALIAS_GRAPHEMES).join('').trim();
  return cut || null;
}
