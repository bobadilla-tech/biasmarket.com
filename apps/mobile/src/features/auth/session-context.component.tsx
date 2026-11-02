import { beforeEach, describe, expect, it, jest } from "@jest/globals";
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react-native";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Pressable, Text } from "react-native";

jest.mock("./session-storage.js", () => ({
  readBuyerSession: jest.fn(),
  writeBuyerSession: jest.fn(),
  deleteBuyerSession: jest.fn(),
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
import { MobileI18nProvider } from "../../i18n/mobile-i18n.js";
import { BuyerSessionProvider, useBuyerSession } from "./session-context.js";
import {
  configureMobileApiClient,
  setMobileBearerToken,
  setSessionRefreshHandler,
  setUnauthorizedHandler,
} from "./api-client.js";

const mockRead = jest.mocked(readBuyerSession);
const mockWrite = jest.mocked(writeBuyerSession);
const mockRemove = jest.mocked(deleteBuyerSession);
const mockLogin = jest.mocked(customerAuth.login);

function SessionProbe() {
  const { status, signIn, signOut } = useBuyerSession();

  return (
    <>
      <Text testID="session-status">{status}</Text>
      <Pressable
        testID="sign-in"
        onPress={() => void signIn("demo", "555", "password123")}
      />
      <Pressable testID="sign-out" onPress={() => void signOut()} />
    </>
  );
}

function renderSession(
  queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  }),
) {
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
    mockLogin.mockResolvedValue({ ok: true, sessionToken: "buyer-token" });
    configureMobileApiClient();
    setMobileBearerToken(null);
    setSessionRefreshHandler(undefined);
    setUnauthorizedHandler(undefined);
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
  });

  it("clears buyer-specific query data after a successful sign-in", async () => {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    queryClient.setQueryData(["buyer", "old-store", "profile"], { id: "old" });
    queryClient.setQueryData(["buyer-order", "old-order"], { id: "old" });
    queryClient.setQueryData(["private-payment-proof", "old-proof"], "old");
    renderSession(queryClient);
    await waitFor(() =>
      expect(screen.getByTestId("session-status").props.children).toBe(
        "unauthenticated",
      ),
    );

    await act(async () => {
      fireEvent.press(screen.getByTestId("sign-in"));
    });

    expect(queryClient.getQueryData(["buyer", "old-store", "profile"])).toBe(
      undefined,
    );
    expect(queryClient.getQueryData(["buyer-order", "old-order"])).toBe(
      undefined,
    );
    expect(
      queryClient.getQueryData(["private-payment-proof", "old-proof"]),
    ).toBe(undefined);
  });

  it("clears SecureStore and session state when an authenticated request returns 401", async () => {
    const fetchMock = jest.spyOn(globalThis, "fetch").mockResolvedValue(
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
    expect(
      new Headers(fetchMock.mock.calls[0]?.[1]?.headers).get("Authorization"),
    ).toBe("Bearer buyer-token");
    expect(mockRemove).toHaveBeenCalledTimes(1);
  });

  it("persists a rotated token and unregisters the handler on unmount", async () => {
    const fetchMock = jest
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ ok: true }), {
          headers: { "X-Session-Token": "rotated-token" },
        }),
      )
      .mockResolvedValueOnce(new Response(JSON.stringify({ ok: true })))
      .mockResolvedValue(
        new Response(JSON.stringify({ ok: true }), {
          headers: { "X-Session-Token": "after-unmount-token" },
        }),
      );
    const view = await renderSession();
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

    mockRead.mockResolvedValue({ token: "buyer-token", storeSlug: "demo" });
    await customFetch("/stores/demo/orders");
    expect(mockWrite).toHaveBeenLastCalledWith({
      token: "rotated-token",
      storeSlug: "demo",
    });
    await customFetch("/stores/demo/orders");
    expect(
      new Headers(fetchMock.mock.calls[1]?.[1]?.headers).get("Authorization"),
    ).toBe("Bearer rotated-token");

    await view.unmount();
    setMobileBearerToken("after-unmount-token");
    await customFetch("/stores/demo/orders");
    expect(mockWrite).toHaveBeenCalledTimes(2);
  });

  it("does not persist a refresh that finishes after sign-out", async () => {
    let releaseRead!: (
      session: { token: string; storeSlug: string } | null,
    ) => void;
    const blockedRead = new Promise<{
      token: string;
      storeSlug: string;
    } | null>((resolve) => {
      releaseRead = resolve;
    });
    const fetchMock = jest.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ ok: true }), {
        headers: { "X-Session-Token": "rotated-token" },
      }),
    );
    await renderSession();
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

    mockRead.mockReturnValueOnce(blockedRead);
    const refreshRequest = customFetch("/stores/demo/orders");
    await act(async () => {
      fireEvent.press(screen.getByTestId("sign-out"));
    });
    releaseRead({ token: "buyer-token", storeSlug: "demo" });
    await refreshRequest;
    await waitFor(() => expect(mockRemove).toHaveBeenCalledTimes(1));

    expect(mockWrite).toHaveBeenCalledTimes(1);
    expect(mockWrite).not.toHaveBeenCalledWith({
      token: "rotated-token",
      storeSlug: "demo",
    });
    expect(mockRemove).toHaveBeenCalledTimes(1);
    expect(
      new Headers(fetchMock.mock.calls[0]?.[1]?.headers).get("Authorization"),
    ).toBe("Bearer buyer-token");
  });
});
