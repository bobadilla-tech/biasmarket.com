import { beforeEach, expect, test, vi } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import { renderWithProviders } from "../../../test-utils/render-with-providers";

const { exchangeReclaimTicket, useGlobalAccount, useGlobalOrders } = vi.hoisted(
  () => ({
    exchangeReclaimTicket: vi.fn(),
    useGlobalAccount: vi.fn(),
    useGlobalOrders: vi.fn(),
  }),
);

vi.mock("@/lib/api-client", () => ({
  apiClient: {
    publicOrders: { exchangeReclaimTicket },
    globalAccount: { deleteMe: vi.fn(), logout: vi.fn() },
  },
}));

vi.mock("../queries/use-global-account", () => ({
  globalAccountKeys: {
    profile: ["global-account", "profile"],
    orders: ["global-account", "orders"],
  },
  useGlobalAccount,
  useGlobalOrders,
}));

vi.mock("../mutations/use-global-logout", () => ({
  useGlobalLogout: () => ({ mutate: vi.fn(), isPending: false }),
}));

vi.mock("@/features/customer-auth", () => ({
  CustomerLoginForm: () => <div>buyer login form</div>,
}));

const { MyPurchases } = await import("./my-purchases");

beforeEach(() => {
  exchangeReclaimTicket.mockReset();
  useGlobalAccount.mockReturnValue({ isPending: false, isError: true });
  useGlobalOrders.mockReturnValue({ data: [], isPending: false });
  window.history.replaceState(null, "", "/es/my-purchases");
});

test("clears the email capability before exchange and shows the mutation error", async () => {
  let hashAtRequest: string | null = null;
  exchangeReclaimTicket.mockImplementation(async () => {
    hashAtRequest = window.location.hash;
    throw new Error("expired");
  });
  window.history.replaceState(
    null,
    "",
    "/es/my-purchases#reclaim=signed.ticket",
  );

  renderWithProviders(<MyPurchases />);

  await waitFor(() =>
    expect(screen.getByRole("alert").textContent).toMatch(
      /enlace no es válido/,
    ),
  );
  expect(hashAtRequest).toBe("");
  expect(exchangeReclaimTicket).toHaveBeenCalledWith({
    ticket: "signed.ticket",
  });
});
