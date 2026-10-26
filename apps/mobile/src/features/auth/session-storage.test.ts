import { beforeEach, describe, expect, it, vi } from "vitest";

const secureStore = vi.hoisted(() => ({
  getItemAsync: vi.fn(),
  setItemAsync: vi.fn(),
  deleteItemAsync: vi.fn(),
}));

vi.mock("expo-secure-store", () => secureStore);

import {
  deleteBuyerSession,
  readBuyerSession,
  writeBuyerSession,
} from "./session-storage.js";

describe("buyer session storage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("stores and reads the access token and its store context using SecureStore", async () => {
    const session = { token: "signed-token", storeSlug: "bias-store" };
    secureStore.getItemAsync.mockResolvedValue(JSON.stringify(session));
    secureStore.setItemAsync.mockResolvedValue(undefined);

    await writeBuyerSession(session);
    await expect(readBuyerSession()).resolves.toEqual(session);

    expect(secureStore.setItemAsync).toHaveBeenCalledWith(
      "biasmarket.buyer-session.v1",
      JSON.stringify(session),
    );
    expect(secureStore.getItemAsync).toHaveBeenCalledWith(
      "biasmarket.buyer-session.v1",
    );
  });

  it("removes malformed session data and treats it as signed out", async () => {
    secureStore.getItemAsync.mockResolvedValue("{bad json");
    secureStore.deleteItemAsync.mockResolvedValue(undefined);

    await expect(readBuyerSession()).resolves.toBeNull();
    expect(secureStore.deleteItemAsync).toHaveBeenCalledWith(
      "biasmarket.buyer-session.v1",
    );
  });

  it("deletes the SecureStore entry on sign out", async () => {
    secureStore.deleteItemAsync.mockResolvedValue(undefined);

    await deleteBuyerSession();

    expect(secureStore.deleteItemAsync).toHaveBeenCalledWith(
      "biasmarket.buyer-session.v1",
    );
  });
});
