import { afterEach, expect, test, vi } from "vitest";

const storesMock = { findBySlug: vi.fn(), create: vi.fn(), remove: vi.fn() };
const myStoresMock = { findMine: vi.fn() };
vi.mock("@/lib/api-client", () => ({
  apiClient: { stores: storesMock, myStores: myStoresMock },
}));

const fetchMock = vi.fn();
vi.stubGlobal("fetch", fetchMock);

const { storesApi } = await import("./stores.api");

afterEach(() => {
  storesMock.findBySlug.mockReset();
  storesMock.create.mockReset();
  storesMock.remove.mockReset();
  myStoresMock.findMine.mockReset();
  fetchMock.mockReset();
});

test("listMine delegates to the generated MyStores.findMine", async () => {
  myStoresMock.findMine.mockResolvedValue([
    { id: "1", name: "Demo", slug: "demo", logoUrl: null },
  ]);

  const result = await storesApi.listMine();

  expect(myStoresMock.findMine).toHaveBeenCalled();
  expect(result).toEqual([{
    id: "1",
    name: "Demo",
    slug: "demo",
    logoUrl: null,
  }]);
});

test("getBySlug validates the response against dashboardStoreSchema", async () => {
  storesMock.findBySlug.mockResolvedValue({
    id: "1",
    name: "Demo",
    slug: "demo",
    whatsappNumber: null,
    defaultCurrency: "PEN",
    logoUrl: null,
  });

  const result = await storesApi.getBySlug("demo");

  expect(storesMock.findBySlug).toHaveBeenCalledWith("demo");
  expect(result.slug).toBe("demo");
});

test("create delegates to the generated Stores.create", async () => {
  storesMock.create.mockResolvedValue({ id: "1", name: "Demo", slug: "demo" });

  const result = await storesApi.create({
    name: "Demo",
    slug: "demo",
    whatsappNumber: "+51987654321",
    defaultCurrency: "PEN",
    themeConfig: {},
  });

  expect(storesMock.create).toHaveBeenCalledWith(
    {
      name: "Demo",
      slug: "demo",
      whatsappNumber: "+51987654321",
      defaultCurrency: "PEN",
      themeConfig: {},
    },
    { fallbackErrorMessage: undefined },
  );
  expect(result.slug).toBe("demo");
});

test("uploadLogo throws with the fallback message on a non-ok response", async () => {
  fetchMock.mockResolvedValueOnce({
    ok: false,
    json: () => Promise.resolve(null),
  });

  await expect(
    storesApi.uploadLogo(
      "store-1",
      new File(["x"], "logo.png"),
      "upload failed",
    ),
  ).rejects.toThrow("upload failed");
});

test("uploadLogo returns the parsed store on success", async () => {
  fetchMock.mockResolvedValueOnce({
    ok: true,
    json: () =>
      Promise.resolve({
        id: "1",
        name: "Demo",
        slug: "demo",
        logoUrl: "https://x/logo.png",
      }),
  });

  const result = await storesApi.uploadLogo(
    "store-1",
    new File(["x"], "logo.png"),
  );

  expect(result.logoUrl).toBe("https://x/logo.png");
});

test("remove delegates to the generated Stores.remove", async () => {
  storesMock.remove.mockResolvedValue({});

  await storesApi.remove("store-1");

  expect(storesMock.remove).toHaveBeenCalledWith("store-1");
});
