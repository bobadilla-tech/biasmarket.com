import { beforeEach, describe, expect, it, jest } from "@jest/globals";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Pressable, Text } from "react-native";

jest.mock("./session-storage.js", () => ({
  readBuyerSession: jest.fn(),
  writeBuyerSession: jest.fn(),
  deleteBuyerSession: jest.fn(),
}));

jest.mock("./push-token.js", () => ({
  registerBuyerPushToken: jest.fn(),
  unregisterBuyerPushToken: jest.fn(),
}));

jest.mock("@biasmarket/types", () => ({
  ...(jest.requireActual("@biasmarket/types") as Record<string, unknown>),
  customerAuth: {
    login: jest.fn(),
    register: jest.fn(),
  },
}));

import { customerAuth } from "@biasmarket/types";
import { customFetch } from "@biasmarket/types";
import {
  deleteBuyerSession,
  readBuyerSession,
  writeBuyerSession,
} from "./session-storage.js";
import {
  registerBuyerPushToken,
  unregisterBuyerPushToken,
} from "./push-token.js";
import { MobileI18nProvider } from "../../i18n/mobile-i18n.js";
import { BuyerSessionProvider, useBuyerSession } from "./session-context.js";
import { configureMobileApiClient } from "./api-client.js";

const mockRead = jest.mocked(readBuyerSession);
const mockWrite = jest.mocked(writeBuyerSession);
const mockRemove = jest.mocked(deleteBuyerSession);
const mockRegisterPush = jest.mocked(registerBuyerPushToken);
const mockUnregisterPush = jest.mocked(unregisterBuyerPushToken);
const mockLogin = jest.mocked(customerAuth.login);

function SessionProbe() {
  const { status, signIn, signOut } = useBuyerSession();

  return (
    <>
      <Text testID="session-status">{status}</Text>
      <Pressable testID="sign-in" onPress={() => void signIn("demo", "555", "password123")} />
      <Pressable testID="sign-out" onPress={() => void signOut()} />
    </>
  );
}

function renderSession() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });

  return render(
    <MobileI18nProvider>
      <QueryClientProvider client={queryClient}>
        <BuyerSessionProvider>
          <SessionProbe />
        </BuyerSessionProvider>
      </QueryClientProvider>
    </MobileI18nProvider>,
  );
}

describe("buyer session lifecycle", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockRead.mockResolvedValue(null);
    mockWrite.mockResolvedValue(undefined);
    mockRemove.mockResolvedValue(undefined);
    mockRegisterPush.mockResolvedValue(undefined);
    mockUnregisterPush.mockResolvedValue(undefined);
    mockLogin.mockResolvedValue({ ok: true, sessionToken: "buyer-token" });
    configureMobileApiClient();
  });

  it("deletes the persisted SecureStore session when the buyer signs out", async () => {
    renderSession();
    await waitFor(() =>
      expect(screen.getByTestId("session-status").props.children).toBe(
        "unauthenticated",
      ),
    );

    await act(async () => {
      fireEvent.press(screen.getByTestId("sign-in"));
    });
    await waitFor(() =>
      expect(screen.getByTestId("session-status").props.children).toBe(
        "authenticated",
      ),
    );

    await act(async () => {
      fireEvent.press(screen.getByTestId("sign-out"));
    });

    await waitFor(() =>
      expect(screen.getByTestId("session-status").props.children).toBe(
        "unauthenticated",
      ),
    );
    expect(mockRemove).toHaveBeenCalledTimes(1);
    expect(mockUnregisterPush).toHaveBeenCalledWith("demo");
  });

  it("clears SecureStore and session state when an authenticated request returns 401", async () => {
    const fetchMock = jest
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(
        new Response(JSON.stringify({ message: "Unauthorized" }), {
          status: 401,
        }),
      );
    renderSession();
    await waitFor(() =>
      expect(screen.getByTestId("session-status").props.children).toBe(
        "unauthenticated",
      ),
    );
    await act(async () => {
      fireEvent.press(screen.getByTestId("sign-in"));
    });
    await waitFor(() =>
      expect(screen.getByTestId("session-status").props.children).toBe(
        "authenticated",
      ),
    );

    await expect(customFetch("/stores/demo/account/me")).rejects.toMatchObject({
      status: 401,
    });

    await waitFor(() =>
      expect(screen.getByTestId("session-status").props.children).toBe(
        "unauthenticated",
      ),
    );
    expect(new Headers(fetchMock.mock.calls[0]?.[1]?.headers).get("Authorization")).toBe(
      "Bearer buyer-token",
    );
    expect(mockRemove).toHaveBeenCalledTimes(1);
  });
});
