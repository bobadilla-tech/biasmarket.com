// @vitest-environment node
import { beforeEach, describe, expect, test, vi } from "vitest";

const { fetchMock } = vi.hoisted(() => ({
  fetchMock: vi.fn(),
}));

const { captureExceptionMock } = vi.hoisted(() => ({
  captureExceptionMock: vi.fn(),
}));

vi.mock("@/features/blog/lib/sanity", () => ({
  client: { fetch: fetchMock },
}));

vi.mock("@sentry/node", () => ({
  captureException: captureExceptionMock,
}));

describe("features/blog/server", () => {
  beforeEach(() => {
    fetchMock.mockReset();
    captureExceptionMock.mockReset();
    // getBlogPosts/getBlogPost are wrapped in React's cache(), which
    // memoizes by arguments outside of a request scope — reset the module
    // registry so each test gets an unmemoized instance.
    vi.resetModules();
  });

  test("getBlogPosts reports and degrades to [] on a generic error", async () => {
    const { getBlogPosts } = await import("./server");
    fetchMock.mockRejectedValueOnce(new Error("Sanity is down"));

    const result = await getBlogPosts();

    expect(result).toEqual([]);
    expect(captureExceptionMock).toHaveBeenCalledTimes(1);
    expect(captureExceptionMock.mock.calls[0]?.[0]).toBeInstanceOf(Error);
  });

  test("getBlogPost reports and degrades to null on a generic error", async () => {
    const { getBlogPost } = await import("./server");
    fetchMock.mockRejectedValueOnce(new Error("Sanity is down"));

    const result = await getBlogPost("some-slug");

    expect(result).toBeNull();
    expect(captureExceptionMock).toHaveBeenCalledTimes(1);
  });

  test("getBlogPosts rethrows a DYNAMIC_SERVER_USAGE digest instead of swallowing it", async () => {
    const { getBlogPosts } = await import("./server");
    const dynamicError = Object.assign(new Error("Dynamic server usage"), {
      digest: "DYNAMIC_SERVER_USAGE",
    });
    fetchMock.mockRejectedValueOnce(dynamicError);

    await expect(getBlogPosts()).rejects.toBe(dynamicError);
    expect(captureExceptionMock).not.toHaveBeenCalled();
  });

  test("getBlogPost rethrows a NEXT_HTTP_ERROR_FALLBACK digest instead of swallowing it", async () => {
    const { getBlogPost } = await import("./server");
    const notFoundError = Object.assign(new Error("Not found"), {
      digest: "NEXT_HTTP_ERROR_FALLBACK;404",
    });
    fetchMock.mockRejectedValueOnce(notFoundError);

    await expect(getBlogPost("some-slug")).rejects.toBe(notFoundError);
    expect(captureExceptionMock).not.toHaveBeenCalled();
  });
});
