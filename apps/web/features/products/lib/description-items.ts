/**
 * Product descriptions are free text. Treat only short, punctuation-light,
 * comma/semicolon-separated phrases as an item list; regular prose keeps its
 * original paragraph layout.
 */
export function getDescriptionItems(description: string): string[] | null {
  const items = description
    .split(/\s*[,;]\s*/)
    .map((item) => item.trim())
    .filter(Boolean);

  if (items.length < 3) return null;
  if (items.some((item) => item.split(/\s+/).length > 6)) return null;
  if (items.some((item) => /[.!?]$/.test(item))) return null;

  return items;
}
