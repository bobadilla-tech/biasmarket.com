export function redirectSystemPath({
  path,
}: {
  path: string;
  initial?: boolean;
}): string {
  let routePath = path;
  if (/^https?:\/\//i.test(path)) {
    try {
      routePath = new URL(path).pathname;
    } catch {
      return "/";
    }
  }
  const stripped = routePath.replace(/^\/(?:es|en)(?=\/|$)/, "");
  return stripped.length > 0 ? stripped : "/";
}
