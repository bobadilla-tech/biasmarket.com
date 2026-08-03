import { afterEach, expect, test, vi } from "vitest";

const apiFetch = vi.fn();
vi.mock(
  "@/lib/api",
  () => ({ apiFetch: (...args: unknown[]) => apiFetch(...args) }),
);

const { sectionsApi } = await import("./sections.api");

afterEach(() => {
  apiFetch.mockReset();
});

test("create builds BANNER content and omits an empty linkUrl", async () => {
  apiFetch.mockResolvedValue({});

  await sectionsApi.create("store-1", {
    type: "BANNER",
    collectionId: "",
    imageUrl: "https://x/y.png",
    linkUrl: "",
    body: "",
  });

  expect(apiFetch).toHaveBeenCalledWith(
    "/stores/store-1/sections",
    {
      method: "POST",
      body: JSON.stringify({
        type: "BANNER",
        collectionId: undefined,
        content: { imageUrl: "https://x/y.png", linkUrl: undefined },
      }),
    },
    undefined,
  );
});

test("create sends collectionId only for COLLECTION type", async () => {
  apiFetch.mockResolvedValue({});

  await sectionsApi.create("store-1", {
    type: "COLLECTION",
    collectionId: "c1",
    imageUrl: "",
    linkUrl: "",
    body: "",
  });

  expect(apiFetch).toHaveBeenCalledWith(
    "/stores/store-1/sections",
    {
      method: "POST",
      body: JSON.stringify({
        type: "COLLECTION",
        collectionId: "c1",
        content: {},
      }),
    },
    undefined,
  );
});

test("reorder PATCHes the full reordered section id list", async () => {
  apiFetch.mockResolvedValue({});

  await sectionsApi.reorder("store-1", ["s2", "s1"]);

  expect(apiFetch).toHaveBeenCalledWith(
    "/stores/store-1/sections/reorder",
    { method: "PATCH", body: JSON.stringify({ sectionIds: ["s2", "s1"] }) },
    undefined,
  );
});
