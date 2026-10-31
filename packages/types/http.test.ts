import { afterEach, expect, test, vi } from "vitest";
import { configureApiClient, customFetch } from "./http.js";
import { claimTicket } from "./generated/public-order-events/public-order-events.js";
import { customFetchBlob } from "./http.js";

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

test("401 with a bearer token clears the native session", async () => {
  const cleanup = vi.fn(async () => undefined);
  const fetchFn = vi.fn(
    async (): Promise<Response> =>
      new Response(JSON.stringify({ message: "Unauthorized" }), {
        status: 401,
      }),
  );
  vi.stubGlobal("fetch", fetchFn);
  configureApiClient({
    baseUrl,
    getAuthHeader: () => ({ Authorization: "Bearer expired-token" }),
    onUnauthorized: cleanup,
  });

  await expect(customFetch("/stores/demo/account/me")).rejects.toMatchObject({
    status: 401,
  });
  expect(cleanup).toHaveBeenCalledOnce();
  expect(cleanup).toHaveBeenCalledWith("Bearer expired-token");
});

test("401 without a bearer token does not clear a session", async () => {
  const cleanup = vi.fn(async () => undefined);
  vi.stubGlobal(
    "fetch",
    vi.fn(
      async (): Promise<Response> =>
        new Response(JSON.stringify({ message: "Unauthorized" }), {
          status: 401,
        }),
    ),
  );
  configureApiClient({ baseUrl, onUnauthorized: cleanup });

  await expect(customFetch("/stores/demo/account/login")).rejects.toMatchObject(
    {
      status: 401,
    },
  );
  expect(cleanup).not.toHaveBeenCalled();
});

test("binary fetch sends the bearer token and returns the private image bytes", async () => {
  const fetchFn = vi.fn(
    async (): Promise<Response> =>
      new Response(new Blob(["private proof"]), {
        headers: { "Content-Type": "image/jpeg" },
      }),
  );
  vi.stubGlobal("fetch", fetchFn);
  configureApiClient({
    baseUrl,
    credentials: "omit",
    getAuthHeader: () => ({ Authorization: "Bearer buyer-token" }),
  });

  const blob = await customFetchBlob(
    "/stores/demo/account/orders/o1/payments/p1/image",
  );

  expect(await blob.text()).toBe("private proof");
  const init = requestOf(fetchFn);
  expect(init?.credentials).toBe("omit");
  expect(new Headers(init?.headers).get("Authorization")).toBe(
    "Bearer buyer-token",
  );
});

// The claim ticket is an httpOnly cookie set by this very request on the API
// host. If the generated call ever stopped sending credentials, the cookie
// would never be stored and the OAuth redirect would find no ticket.
test("the generated claimTicket call sends credentials and a JSON body, and the token is not in the body", async () => {
  const fetchFn = setupFetch();
  configureApiClient({ baseUrl });

  await claimTicket("tok_secret", { moment: "banner" });

  const [url, init] = fetchFn.mock.calls[0]!;
  expect(String(url)).toBe(`${baseUrl}/public/orders/tok_secret/claim-ticket`);
  expect(init?.credentials).toBe("include");
  expect(init?.method).toBe("POST");
  expect(new Headers(init?.headers).get("Content-Type")).toBe(
    "application/json",
  );
  expect(init?.body).toBe(JSON.stringify({ moment: "banner" }));
});
