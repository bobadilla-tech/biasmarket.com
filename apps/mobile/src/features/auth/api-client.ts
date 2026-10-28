import { configureApiClient } from "@biasmarket/types";

const API_BASE_URL =
  process.env.EXPO_PUBLIC_API_URL?.trim().replace(/\/+$/, "") ||
  "https://api.biasmarket.com/api";

let configured = false;
let bearerToken: string | null = null;
let unauthorizedHandler:
  ((authorization: string) => void | Promise<void>) | undefined;
let sessionRefreshHandler:
  ((authorization: string, token: string) => void | Promise<void>) | undefined;

export function configureMobileApiClient(): void {
  if (configured) return;

  configureApiClient({
    baseUrl: API_BASE_URL,
    credentials: "omit",
    getAuthHeader: () =>
      bearerToken
        ? { Authorization: `Bearer ${bearerToken}`, "X-Client": "mobile" }
        : undefined,
    onUnauthorized: (authorization) => unauthorizedHandler?.(authorization),
    onSessionRefresh: (authorization, token) =>
      sessionRefreshHandler?.(authorization, token),
  });
  configured = true;
}

export function setMobileBearerToken(token: string | null): void {
  bearerToken = token;
}

export function isCurrentMobileAuthorization(authorization: string): boolean {
  return bearerToken !== null && authorization === `Bearer ${bearerToken}`;
}

export function setUnauthorizedHandler(
  handler: ((authorization: string) => void | Promise<void>) | undefined,
): void {
  unauthorizedHandler = handler;
}

export function setSessionRefreshHandler(
  handler:
    | ((authorization: string, token: string) => void | Promise<void>)
    | undefined,
): void {
  sessionRefreshHandler = handler;
}
