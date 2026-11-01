export function redirectSystemPath({
  path,
}: {
  path: string;
  initial?: boolean;
}): string {
  const stripped = path.replace(/^\/(?:es|en)(?=\/|$)/, "");
  return stripped.length > 0 ? stripped : "/";
}
