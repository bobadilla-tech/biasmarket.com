type NativeIntentOptions = { path: string; initial: boolean };

const SAFE_SEGMENT = /^[a-zA-Z0-9_-]+$/;

export function redirectSystemPath({ path }: NativeIntentOptions): string {
  try {
    const url = new URL(path, "https://biasmarket.com");
    const segments = url.pathname
      .split("/")
      .filter(Boolean)
      .map((segment) => decodeURIComponent(segment));
    if (segments[0] === "es" || segments[0] === "en") segments.shift();

    if (
      segments.length === 2 &&
      segments[0] === "store" &&
      SAFE_SEGMENT.test(segments[1])
    ) {
      return `/store/${encodeURIComponent(segments[1])}`;
    }

    if (
      segments.length === 4 &&
      segments[0] === "store" &&
      SAFE_SEGMENT.test(segments[1]) &&
      segments[2] === "product" &&
      SAFE_SEGMENT.test(segments[3])
    ) {
      return `/store/${encodeURIComponent(segments[1])}/product/${encodeURIComponent(segments[3])}`;
    }
  } catch {
    // Malformed or encoded path segments should never reach generated routes.
  }

  return "/";
}
