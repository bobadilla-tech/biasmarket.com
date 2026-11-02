import { beforeEach, describe, expect, it, vi } from "vitest";
import { QueryClient } from "@tanstack/react-query";

const storage = vi.hoisted(() => ({
  getAllKeys: vi.fn(),
  multiRemove: vi.fn(),
}));

vi.mock("@react-native-async-storage/async-storage", () => ({
  default: {
    getAllKeys: storage.getAllKeys,
    multiRemove: storage.multiRemove,
  },
}));

import { ApiError } from "@biasmarket/types";
import {
  clearBuyerCheckoutState,
  clearBuyerCheckoutQueries,
  isSessionEndedDeleteError,
} from "./account-deletion";

beforeEach(() => {
  vi.clearAllMocks();
  storage.getAllKeys.mockResolvedValue([
    "biasmarket:cart:one",
    "biasmarket:checkout-key:one",
    "unrelated:preference",
  ]);
  storage.multiRemove.mockResolvedValue(undefined);
});

describe("isSessionEndedDeleteError", () => {
  it("recognizes an expired session response", () => {
    expect(isSessionEndedDeleteError(new ApiError("Unauthorized", 401))).toBe(
      true,
    );
  });

  it("keeps other errors on the ordinary delete-failed path", () => {
    expect(isSessionEndedDeleteError(new ApiError("Unavailable", 503))).toBe(
      false,
    );
    expect(isSessionEndedDeleteError(new Error("offline"))).toBe(false);
  });
});

describe("clearBuyerCheckoutState", () => {
  it("removes cart and checkout keys for every store without touching other data", async () => {
    await clearBuyerCheckoutState();

    expect(storage.multiRemove).toHaveBeenCalledWith([
      "biasmarket:cart:one",
      "biasmarket:checkout-key:one",
    ]);
  });

  it("does not call multiRemove when no checkout data exists", async () => {
    storage.getAllKeys.mockResolvedValue(["unrelated:preference"]);

    await clearBuyerCheckoutState();

    expect(storage.multiRemove).not.toHaveBeenCalled();
  });
});

describe("clearBuyerCheckoutQueries", () => {
  it("removes cart and checkout data while preserving unrelated query data", () => {
    const queryClient = new QueryClient();
    queryClient.setQueryData(["cart", "store-a"], []);
    queryClient.setQueryData(["checkout", "store-a", "payment"], []);
    queryClient.setQueryData(["catalog", "directory"], []);

    clearBuyerCheckoutQueries(queryClient);

    expect(queryClient.getQueryData(["cart", "store-a"])).toBeUndefined();
    expect(
      queryClient.getQueryData(["checkout", "store-a", "payment"]),
    ).toBeUndefined();
    expect(queryClient.getQueryData(["catalog", "directory"])).toEqual([]);
  });
});
