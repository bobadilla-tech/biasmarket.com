import { expect, test, vi, afterEach } from "vitest";

const apiFetch = vi.fn();
vi.mock("@/lib/api", () => ({ apiFetch: (...args: unknown[]) => apiFetch(...args) }));

const fetchMock = vi.fn();
vi.stubGlobal("fetch", fetchMock);

const { storesApi } = await import("./stores.api");

afterEach(() => {
  apiFetch.mockReset();
  fetchMock.mockReset();
});

test("listMine validates the response array", async () => {
  apiFetch.mockResolvedValueOnce([
    { id: "1", name: "Demo", slug: "demo", logoUrl: null },
  ]);

  const result = await storesApi.listMine();

  expect(apiFetch).toHaveBeenCalledWith("/me/stores");
  expect(result).toEqual([{ id: "1", name: "Demo", slug: "demo", logoUrl: null }]);
});

test("create POSTs the payload and validates the response", async () => {
  apiFetch.mockResolvedValueOnce({ id: "1", name: "Demo", slug: "demo", logoUrl: null });

  const result = await storesApi.create({
    name: "Demo",
    slug: "demo",
    whatsappNumber: "+51987654321",
    defaultCurrency: "PEN",
    themeConfig: {},
  });

  expect(apiFetch).toHaveBeenCalledWith(
    "/stores",
    {
      method: "POST",
      body: JSON.stringify({
        name: "Demo",
        slug: "demo",
        whatsappNumber: "+51987654321",
        defaultCurrency: "PEN",
        themeConfig: {},
      }),
    },
    undefined,
  );
  expect(result.slug).toBe("demo");
});

test("uploadLogo throws with the fallback message on a non-ok response", async () => {
  fetchMock.mockResolvedValueOnce({ ok: false });

  await expect(
    storesApi.uploadLogo("store-1", new File(["x"], "logo.png"), "upload failed"),
  ).rejects.toThrow("upload failed");
});

test("remove DELETEs the store", async () => {
  apiFetch.mockResolvedValueOnce({});

  await storesApi.remove("store-1");

  expect(apiFetch).toHaveBeenCalledWith("/stores/store-1", { method: "DELETE" });
});
