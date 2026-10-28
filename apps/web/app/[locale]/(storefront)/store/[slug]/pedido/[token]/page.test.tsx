import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "@biasmarket/types";
import { getTranslations } from "next-intl/server";
import { apiClient } from "@/lib/api-client";
import { PublicOrderView } from "@/features/public-orders/components/public-order-view";
import { PublicOrderUnavailable } from "@/features/public-orders/components/public-order-unavailable";
import { generateMetadata, default as PublicOrderPage } from "./page";

vi.mock("next-intl/server", () => ({
  getTranslations: vi.fn(async () => (key: string) => key),
}));

vi.mock("@/lib/api-client", () => ({
  apiClient: {
    publicOrders: { getByToken: vi.fn() },
  },
}));

vi.mock("@/features/public-orders/components/public-order-view", () => ({
  PublicOrderView: vi.fn(() => null),
}));

vi.mock("@/features/public-orders/components/public-order-unavailable", () => ({
  PublicOrderUnavailable: vi.fn(() => null),
}));

const getByToken = vi.mocked(apiClient.publicOrders.getByToken);

const order = {
  store: { slug: "tienda" },
} as Awaited<ReturnType<typeof apiClient.publicOrders.getByToken>>;

const params = Promise.resolve({
  locale: "es" as const,
  slug: "tienda",
  token: "secret-token",
});

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("public order page", () => {
  it("is always noindex", async () => {
    const metadata = await generateMetadata({
      params: Promise.resolve({ locale: "es" }),
    });

    expect(metadata.robots).toEqual({ index: false, follow: false });
    expect(getTranslations).toHaveBeenCalledWith({
      locale: "es",
      namespace: "storefront.publicOrder",
    });
  });

  it("loads the token without caching and renders the matching store order", async () => {
    getByToken.mockResolvedValue(order);

    const page = await PublicOrderPage({ params });

    expect(getByToken).toHaveBeenCalledWith("secret-token", {
      cache: "no-store",
    });
    expect(page).toMatchObject({
      type: PublicOrderView,
      props: { order, locale: "es" },
    });
  });

  it("does not reveal an order under a mismatched store slug", async () => {
    getByToken.mockResolvedValue(order);

    const page = await PublicOrderPage({
      params: Promise.resolve({ ...(await params), slug: "other-store" }),
    });

    expect(page).toMatchObject({
      type: PublicOrderUnavailable,
      props: { slug: "other-store" },
    });
  });

  it("shows the revoked or invalid link state for a 404", async () => {
    getByToken.mockRejectedValue(new ApiError("Not found", 404));

    const page = await PublicOrderPage({ params });

    expect(page).toMatchObject({
      type: PublicOrderUnavailable,
      props: { slug: "tienda" },
    });
  });

  it("shows a safe unavailable state for other API errors", async () => {
    getByToken.mockRejectedValue(new Error("request failed: secret-token"));

    const page = await PublicOrderPage({ params });

    expect(page).toMatchObject({
      type: PublicOrderUnavailable,
      props: { slug: "tienda", unavailable: true },
    });
  });
});
