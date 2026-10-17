import type { BrowserContext, Page } from "@playwright/test";
import { API_URL, RUN_ID } from "./env";

let counter = 0;

// A Google "code" unique to this test. The CI stub (scripts/ci/google-stub.mjs)
// turns `e2e-<runid>-<n>` into the identity `e2e-<runid>-<n>@example.test`.
export const uniqueGoogleCode = () => `e2e-${RUN_ID}-${++counter}`;

// Google is never reached. Playwright does not route the hops of a server-side
// redirect, so the browser's trip API -> accounts.google.com can't be caught at
// accounts.google.com. Instead the API's own start response is intercepted:
// the real request runs (the API sets the `bm_buyer_google_state` cookie and
// answers 302 to Google), and only its `Location` is replaced with a 302 to the
// real API callback carrying our `code` and the API's own `state`. Only `state`
// is taken from the intercepted Location; the host is the e2e API base, never
// the intercepted `redirect_uri` (the state cookie lives on the API host).
// A route on accounts.google.com aborts anything that would still get there.
// Register BEFORE the click that starts the flow.
export async function stubGoogle(
  page: Page,
  code: string,
  onHop?: () => Promise<void>,
): Promise<void> {
  await page.route("https://accounts.google.com/**", (route) => route.abort());
  await page.route(`${API_URL}/api/account/google?**`, async (route) => {
    const response = await route.fetch({ maxRedirects: 0 });
    const location = response.headers()["location"];
    if (
      response.status() !== 302 ||
      !location?.startsWith("https://accounts.google.com/")
    ) {
      throw new Error(
        `expected a 302 to Google, got ${response.status()} ${location ?? ""}`,
      );
    }
    const state = new URL(location).searchParams.get("state");
    if (!state) throw new Error("Google auth URL carried no state");
    await onHop?.();
    const callback = new URL(`${API_URL}/api/account/google/callback`);
    callback.searchParams.set("code", code);
    callback.searchParams.set("state", state);
    // Keep every header (notably Set-Cookie, one per line) and swap Location.
    const headers: Record<string, string> = {};
    for (const { name, value } of response.headersArray()) {
      const key = name.toLowerCase();
      headers[key] = key in headers ? `${headers[key]}\n${value}` : value;
    }
    headers["location"] = callback.toString();
    await route.fulfill({ response, status: 302, headers });
  });
}

// `bm_claim` has path /api/account/google, so a URL-filtered
// `context.cookies(<api>)` never returns it: read everything and filter here.
export async function cookieNamed(
  context: BrowserContext,
  name: string,
): Promise<string | undefined> {
  const all = await context.cookies();
  return all.find((cookie) => cookie.name === name)?.value;
}
