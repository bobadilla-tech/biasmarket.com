export interface ApiClientConfig {
  baseUrl: string;
  /** Per-request auth header — called each time so refreshes are picked up. */
  getAuthHeader?: () => Record<string, string> | undefined;
  credentials?: RequestCredentials;
}

let config: ApiClientConfig | undefined;

export function configureApiClient(newConfig: ApiClientConfig): void {
  config = newConfig;
}

// Extends `RequestInit` with a field that isn't part of `fetch` at all —
// Orval types every generated method's trailing `options` param as
// `Parameters<typeof customFetch>[1]`, so whatever this interface declares
// becomes real, typed, per-call-site API. This is how a caller-supplied
// fallback error message (e.g. an i18n string) reaches the mutator without a
// hand-written wrapper per endpoint.
export interface RequestOptions extends RequestInit {
  fallbackErrorMessage?: string;
}

// Carries the HTTP status alongside the message so callers that need to
// distinguish e.g. 401 (no session) from 404 (wrong owner / not found) can do
// so with `error instanceof ApiError && error.status === 404`, instead of
// string-matching the backend's message text.
export class ApiError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

// Error responses aren't part of the OpenAPI generation pipeline (only 2xx
// paths are typed — see docs/plans/2026-08-04-nestjs-openapi-client-generation-plan.md's
// Phase 3 scope note), so the parsed error body is untyped here. Same
// defensive shape apiFetch always used: try the backend's `message` field,
// fall back to a caller-supplied message.
function errorMessage(
  data: unknown,
  fallback: string | undefined,
  status: number,
): string {
  if (
    data && typeof data === "object" && "message" in data &&
    typeof (data as { message: unknown }).message === "string"
  ) {
    return (data as { message: string }).message;
  }
  return fallback ?? `Request failed with status ${status}`;
}

export async function customFetch<T>(
  url: string,
  options: RequestOptions = {},
): Promise<T> {
  if (!config) {
    throw new Error(
      "configureApiClient() must be called before making API requests",
    );
  }
  const { fallbackErrorMessage, headers: callerHeaders, ...init } = options;

  // Never send an Authorization header over cleartext HTTP — a baseUrl of
  // http:// means any Authorization (injected or caller-supplied) would be
  // readable on the wire. Non-authenticated requests over HTTP keep working;
  // authenticated requests are only allowed over HTTPS.
  const isCleartextHttp = /^http:\/\//i.test(config.baseUrl);

  const authHeader = config.getAuthHeader?.();
  const mergedHeaders = new Headers(callerHeaders as HeadersInit);
  if (authHeader && !isCleartextHttp) {
    for (const [key, value] of Object.entries(authHeader)) {
      if (!mergedHeaders.has(key)) {
        mergedHeaders.set(key, value);
      }
    }
  }
  if (isCleartextHttp) {
    mergedHeaders.delete("Authorization");
  }

  const res = await fetch(`${config.baseUrl}${url}`, {
    ...init,
    headers: mergedHeaders,
    credentials: config.credentials ?? "include",
  });

  const body = [204, 205, 304].includes(res.status) ? null : await res.text();
  let data: unknown;
  let parseError = false;
  if (body) {
    try {
      data = JSON.parse(body);
    } catch {
      parseError = true;
    }
  }

  if (!res.ok) {
    throw new ApiError(
      errorMessage(
        parseError ? undefined : data,
        fallbackErrorMessage,
        res.status,
      ),
      res.status,
    );
  }
  if (parseError) {
    throw new Error(fallbackErrorMessage ?? "Received invalid JSON response");
  }

  return data as T;
}
