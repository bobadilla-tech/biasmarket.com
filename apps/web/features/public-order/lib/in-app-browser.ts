// In-app browsers (Instagram, Facebook, TikTok, ...) block or break Google
// sign-in ("disallowed_useragent") and often drop cookies on the hop, so the
// claim shows instructions to open the link in the phone's own browser
// instead. Read from `navigator.userAgent` on the client only: the page shell
// stays fetch-free and header-free so link-preview bots never count as opens.
const IN_APP_PATTERNS: readonly RegExp[] = [
  /Instagram/i,
  /FBAN|FBAV|FB_IAB|FBIOS/,
  /Twitter/i,
  /musical_ly|Bytedance|TikTok|BytedanceWebview/i,
  /\bLine\//i,
  /Snapchat/i,
  /MicroMessenger/i,
];

export function isInAppBrowser(userAgent: string | undefined | null): boolean {
  if (!userAgent) return false;
  return IN_APP_PATTERNS.some((pattern) => pattern.test(userAgent));
}
