import { configureApiClient } from "@biasmarket/types";

const API_BASE_URL =
  process.env.EXPO_PUBLIC_API_URL?.trim().replace(/\/+$/, "") ||
  "https://api.biasmarket.com";

let configured = false;
let bearerToken: string | null = null;
let unauthorizedHandler: (() => void | Promise<void>) | undefined;

export function configureMobileApiClient(): void {
  if (configured) return;

  configureApiClient({
    baseUrl: API_BASE_URL,
    credentials: "omit",
    getAuthHeader: () =>
      bearerToken ? { Authorization: `Bearer ${bearerToken}` } : undefined,
    onUnauthorized: () => unauthorizedHandler?.(),
  });
  configured = true;
}

export function setMobileBearerToken(token: string | null): void {
  bearerToken = token;
}

export function setUnauthorizedHandler(
  handler: (() => void | Promise<void>) | undefined,
): void {
  unauthorizedHandler = handler;
}
