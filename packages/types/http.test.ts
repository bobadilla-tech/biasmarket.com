import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  ApiError,
  configureApiClient,
  customFetch,
  type ApiClientConfig,
} from "./http.js";

const fakeJson = (data: unknown): Response =>
  ({
    ok: true,
    status: 200,
    text: () => Promise.resolve(JSON.stringify(data)),
    headers: new Headers(),
  }) as unknown as Response;

const fakeError = (status: number, body: unknown): Response =>
  ({
    ok: false,
    status,
    text: () => Promise.resolve(JSON.stringify(body)),
    headers: new Headers(),
  }) as unknown as Response;

const fakeNoContent = (): Response =>
  ({
    ok: true,
    status: 204,
    text: () => Promise.resolve(""),
    headers: new Headers(),
  }) as unknown as Response;

let fetchSpy: ReturnType<typeof vi.fn>;

function configure(overrides: Partial<ApiClientConfig> = {}) {
  configureApiClient({
    baseUrl: "https://api.example.com",
    ...overrides,
  });
}

beforeEach(() => {
  fetchSpy = vi.fn();
  vi.stubGlobal("fetch", fetchSpy);
});

afterEach(() => {
  vi.unstubAllGlobals();
  fetchSpy.mockReset();
});

describe("customFetch", () => {
  it("sends no Authorization and credentials: include by default", async () => {
    configure();
    fetchSpy.mockResolvedValue(fakeJson({ ok: true }));

    await customFetch<{ ok: boolean }>("/test");

    expect(fetchSpy).toHaveBeenCalledOnce();
    const [, init] = fetchSpy.mock.calls[0];
    expect(init?.credentials).toBe("include");

    const headers = new Headers(init?.headers as HeadersInit);
    expect(headers.has("Authorization")).toBe(false);
  });

  it("includes the auth header returned by getAuthHeader", async () => {
    configure({
      getAuthHeader: () => ({ Authorization: "Bearer abc123" }),
    });
    fetchSpy.mockResolvedValue(fakeJson({ ok: true }));

    await customFetch<{ ok: boolean }>("/test");

    const [, init] = fetchSpy.mock.calls[0];
    const headers = new Headers(init?.headers as HeadersInit);
    expect(headers.get("Authorization")).toBe("Bearer abc123");
  });

  it("sends no Authorization when getAuthHeader returns undefined", async () => {
    configure({
      getAuthHeader: () => undefined,
    });
    fetchSpy.mockResolvedValue(fakeJson({ ok: true }));

    await customFetch<{ ok: boolean }>("/test");

    const [, init] = fetchSpy.mock.calls[0];
    const headers = new Headers(init?.headers as HeadersInit);
    expect(headers.has("Authorization")).toBe(false);
  });

  it("sends no Authorization when getAuthHeader returns empty object", async () => {
    configure({
      getAuthHeader: () => ({}),
    });
    fetchSpy.mockResolvedValue(fakeJson({ ok: true }));

    await customFetch<{ ok: boolean }>("/test");

    const [, init] = fetchSpy.mock.calls[0];
    const headers = new Headers(init?.headers as HeadersInit);
    expect(headers.has("Authorization")).toBe(false);
  });

  it("respects credentials: omit from config", async () => {
    configure({ credentials: "omit" });
    fetchSpy.mockResolvedValue(fakeJson({ ok: true }));

    await customFetch<{ ok: boolean }>("/test");

    const [, init] = fetchSpy.mock.calls[0];
    expect(init?.credentials).toBe("omit");
  });

  it("caller-supplied headers win over injected auth header", async () => {
    configure({
      getAuthHeader: () => ({ Authorization: "Bearer injected" }),
    });
    fetchSpy.mockResolvedValue(fakeJson({ ok: true }));

    await customFetch<{ ok: boolean }>("/test", {
      headers: { Authorization: "Bearer caller-value" },
    });

    const [, init] = fetchSpy.mock.calls[0];
    const headers = new Headers(init?.headers as HeadersInit);
    expect(headers.get("Authorization")).toBe("Bearer caller-value");
  });

  it("merges caller headers with auth header when keys differ", async () => {
    configure({
      getAuthHeader: () => ({ Authorization: "Bearer token" }),
    });
    fetchSpy.mockResolvedValue(fakeJson({ ok: true }));

    await customFetch<{ ok: boolean }>("/test", {
      headers: { "X-Custom": "value" },
    });

    const [, init] = fetchSpy.mock.calls[0];
    const headers = new Headers(init?.headers as HeadersInit);
    expect(headers.get("Authorization")).toBe("Bearer token");
    expect(headers.get("X-Custom")).toBe("value");
  });

  it("calls getAuthHeader on every request", async () => {
    const spy = vi.fn(() => ({ Authorization: "Bearer fresh" }));
    configure({ getAuthHeader: spy });
    fetchSpy.mockResolvedValue(fakeJson({ ok: true }));

    await customFetch<{ ok: boolean }>("/a");
    await customFetch<{ ok: boolean }>("/b");

    expect(spy).toHaveBeenCalledTimes(2);
  });

  it("prepends baseUrl to the url", async () => {
    configure({ baseUrl: "https://api.example.com/api" });
    fetchSpy.mockResolvedValue(fakeJson({ ok: true }));

    await customFetch<{ ok: boolean }>("/stores");

    expect(fetchSpy.mock.calls[0][0]).toBe(
      "https://api.example.com/api/stores",
    );
  });

  it("returns parsed JSON data on success", async () => {
    configure();
    fetchSpy.mockResolvedValue(fakeJson({ name: "Test Store" }));

    const result = await customFetch<{ name: string }>("/store");

    expect(result).toEqual({ name: "Test Store" });
  });

  it("returns undefined body for 204 responses", async () => {
    configure();
    fetchSpy.mockResolvedValue(fakeNoContent());

    const result = await customFetch<null>("/delete");

    expect(result).toBeUndefined();
  });

  it("throws ApiError with status on non-2xx responses", async () => {
    configure();
    fetchSpy.mockResolvedValue(
      fakeError(404, { message: "Store not found" }),
    );

    try {
      await customFetch<unknown>("/missing");
      expect.fail("should have thrown");
    } catch (e) {
      expect(e).toBeInstanceOf(ApiError);
      expect((e as ApiError).status).toBe(404);
      expect((e as ApiError).message).toBe("Store not found");
    }
  });

  it("omits the auth header when baseUrl is cleartext HTTP", async () => {
    configure({
      baseUrl: "http://localhost:3000/api",
      getAuthHeader: () => ({ Authorization: "Bearer secret" }),
    });
    fetchSpy.mockResolvedValue(fakeJson({ ok: true }));

    await customFetch<{ ok: boolean }>("/test");

    const headers = new Headers(fetchSpy.mock.calls[0][1]?.headers as HeadersInit);
    expect(headers.has("Authorization")).toBe(false);
  });

  it("strips a caller-supplied Authorization header over cleartext HTTP", async () => {
    configure({ baseUrl: "http://localhost:3000/api" });
    fetchSpy.mockResolvedValue(fakeJson({ ok: true }));

    await customFetch<{ ok: boolean }>("/test", {
      headers: { Authorization: "Bearer caller-leaked" },
    });

    const headers = new Headers(fetchSpy.mock.calls[0][1]?.headers as HeadersInit);
    expect(headers.has("Authorization")).toBe(false);
  });

  it("still sends the auth header over HTTPS", async () => {
    configure({
      baseUrl: "https://api.example.com",
      getAuthHeader: () => ({ Authorization: "Bearer safe" }),
    });
    fetchSpy.mockResolvedValue(fakeJson({ ok: true }));

    await customFetch<{ ok: boolean }>("/test");

    const headers = new Headers(fetchSpy.mock.calls[0][1]?.headers as HeadersInit);
    expect(headers.get("Authorization")).toBe("Bearer safe");
  });
});
