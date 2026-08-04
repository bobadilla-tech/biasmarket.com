// The fetch mutator every Orval-generated method calls through (see
// orval.config.ts's `override.mutator`). Centralizes what `apps/web`'s
// hand-written `apiFetch`/`collections.api.ts` used to repeat per call site:
// base-URL resolution, `credentials: "include"` for the cookie-session auth,
// and throwing on non-2xx. `configureApiClient` must run once before any
// generated method is called — `apps/web/lib/api-client.ts` does this at
// module load, same place `createApiClient(baseUrl)` used to be constructed.
export interface ApiClientConfig {
  baseUrl: string;
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

// Error responses aren't part of the OpenAPI generation pipeline (only 2xx
// paths are typed — see docs/plans/2026-08-04-nestjs-openapi-client-generation-plan.md's
// Phase 3 scope note), so the parsed error body is untyped here. Same
// defensive shape apiFetch always used: try the backend's `message` field,
// fall back to a caller-supplied message.
function errorMessage(data: unknown, fallback: string | undefined, status: number): string {
  if (data && typeof data === "object" && "message" in data && typeof (data as { message: unknown }).message === "string") {
    return (data as { message: string }).message;
  }
  return fallback ?? `Request failed with status ${status}`;
}

export async function customFetch<T>(url: string, options: RequestOptions = {}): Promise<T> {
  if (!config) {
    throw new Error("configureApiClient() must be called before making API requests");
  }
  const { fallbackErrorMessage, ...init } = options;
  const res = await fetch(`${config.baseUrl}${url}`, {
    ...init,
    credentials: "include",
  });

  const body = [204, 205, 304].includes(res.status) ? null : await res.text();
  const data = body ? JSON.parse(body) : undefined;

  if (!res.ok) {
    throw new Error(errorMessage(data, fallbackErrorMessage, res.status));
  }

  return data as T;
}
