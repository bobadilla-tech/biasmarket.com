import { afterEach, expect, test, vi } from "vitest";
import { configureApiClient, customFetch } from "./http.js";

const baseUrl = "https://api.example.com";

type FetchMock = ReturnType<
  typeof vi.fn<(input: RequestInfo, init?: RequestInit) => Promise<Response>>
>;

function setupFetch(): FetchMock {
  const fn = vi.fn(
    async (): Promise<Response> => new Response(JSON.stringify({ ok: true })),
  );
  vi.stubGlobal("fetch", fn);
  return fn;
}

function requestOf(fetchFn: FetchMock): RequestInit | undefined {
  return fetchFn.mock.calls[fetchFn.mock.calls.length - 1][1];
}

afterEach(() => {
  vi.unstubAllGlobals();
});

test("no getAuthHeader -> request has no Authorization and credentials: include", async () => {
  const fetchFn = setupFetch();
  configureApiClient({ baseUrl });
  await customFetch("/stores");

  const init = requestOf(fetchFn);
  expect(init?.credentials).toBe("include");
  const headers = new Headers(init?.headers);
  expect(headers.has("Authorization")).toBe(false);
});

test("getAuthHeader returning a header -> it is sent on the outgoing request", async () => {
  const fetchFn = setupFetch();
  configureApiClient({
    baseUrl,
    getAuthHeader: () => ({ Authorization: "Bearer token123" }),
  });
  await customFetch("/stores");

  const init = requestOf(fetchFn);
  const headers = new Headers(init?.headers);
  expect(headers.get("Authorization")).toBe("Bearer token123");
});

test("getAuthHeader returning undefined -> no Authorization and no crash", async () => {
  const fetchFn = setupFetch();
  configureApiClient({
    baseUrl,
    getAuthHeader: () => undefined,
  });
  await expect(customFetch("/stores")).resolves.toEqual({ ok: true });

  const init = requestOf(fetchFn);
  const headers = new Headers(init?.headers);
  expect(headers.has("Authorization")).toBe(false);
});

test("credentials: omit and getAuthHeader merge without caller header override", async () => {
  const fetchFn = setupFetch();
  configureApiClient({
    baseUrl,
    credentials: "omit",
    getAuthHeader: () => ({ Authorization: "Bearer tok" }),
  });
  await customFetch("/stores");

  const init = requestOf(fetchFn);
  expect(init?.credentials).toBe("omit");
  const headers = new Headers(init?.headers);
  expect(headers.get("Authorization")).toBe("Bearer tok");
});

test("per-call RequestOptions.headers override the injected auth header", async () => {
  const fetchFn = setupFetch();
  configureApiClient({
    baseUrl,
    getAuthHeader: () => ({ Authorization: "Bearer injected" }),
  });
  await customFetch("/stores", {
    method: "GET",
    headers: { Authorization: "Bearer caller" },
  });

  const init = requestOf(fetchFn);
  const headers = new Headers(init?.headers);
  expect(headers.get("Authorization")).toBe("Bearer caller");
});
