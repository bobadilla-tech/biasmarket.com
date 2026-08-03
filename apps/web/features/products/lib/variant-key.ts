export function keyForAttributes(
  attributes: Record<string, string> | null | undefined,
) {
  return Object.entries(attributes ?? {})
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${k}:${v}`)
    .join("|");
}
