import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ApiError } from "@biasmarket/types";
import { renderWithProviders } from "../../../test-utils/render-with-providers";

const { claimTicket } = vi.hoisted(() => ({ claimTicket: vi.fn() }));
vi.mock("@/lib/api-client", () => ({
  apiClient: { publicOrders: { claimTicket } },
}));

const { ClaimOrderButton } = await import("./claim-order-button");

const TOKEN = "tok_ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789abc";
const IN_APP_UA =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/21F90 Instagram 345.0.0.31.108";
const realLocation = window.location;
let assign: ReturnType<typeof vi.fn>;

beforeEach(() => {
  assign = vi.fn();
  Object.defineProperty(window, "location", {
    configurable: true,
    value: {
      ...realLocation,
      assign,
      href: `https://biasmarket.com/es/store/k/pedido/${TOKEN}`,
    },
  });
});
afterEach(() => {
  Object.defineProperty(window, "location", {
    configurable: true,
    value: realLocation,
  });
  vi.restoreAllMocks();
  vi.resetAllMocks();
});

test("explains what is stored before offering the button", () => {
  renderWithProviders(<ClaimOrderButton token={TOKEN} />);
  expect(
    screen.getByText(/usamos tu correo y tu nombre de Google/),
  ).toBeTruthy();
  expect(
    screen.getByRole("button", { name: "Guardar con Google" }),
  ).toBeTruthy();
});

test("posts the ticket first, then navigates with only a flag and the locale in the URL", async () => {
  claimTicket.mockResolvedValue(undefined);
  renderWithProviders(<ClaimOrderButton token={TOKEN} moment="banner" />);

  await userEvent.click(
    screen.getByRole("button", { name: "Guardar con Google" }),
  );

  await waitFor(() => expect(assign).toHaveBeenCalledTimes(1));
  expect(claimTicket).toHaveBeenCalledWith(TOKEN, { moment: "banner" });
  expect(claimTicket.mock.invocationCallOrder[0]).toBeLessThan(
    assign.mock.invocationCallOrder[0]!,
  );
  const url = new URL(String(assign.mock.calls[0]![0]));
  expect(url.pathname).toBe("/api/account/google");
  expect([...url.searchParams.keys()].sort()).toEqual(["claim", "locale"]);
  expect(url.searchParams.get("claim")).toBe("1");
  expect(String(assign.mock.calls[0]![0])).not.toContain(TOKEN);
});

test("sends no moment when none is given", async () => {
  claimTicket.mockResolvedValue(undefined);
  renderWithProviders(<ClaimOrderButton token={TOKEN} />);
  await userEvent.click(
    screen.getByRole("button", { name: "Guardar con Google" }),
  );
  await waitFor(() => expect(claimTicket).toHaveBeenCalledWith(TOKEN, {}));
});

test("never navigates when the ticket request fails", async () => {
  claimTicket.mockRejectedValue(new ApiError("boom", 500));
  renderWithProviders(<ClaimOrderButton token={TOKEN} />);
  await userEvent.click(
    screen.getByRole("button", { name: "Guardar con Google" }),
  );
  expect(await screen.findByRole("alert")).toBeTruthy();
  expect(assign).not.toHaveBeenCalled();
});

test("a 422 tells the buyer the payment is not validated yet", async () => {
  claimTicket.mockRejectedValue(new ApiError("no", 422));
  renderWithProviders(<ClaimOrderButton token={TOKEN} />);
  await userEvent.click(
    screen.getByRole("button", { name: "Guardar con Google" }),
  );
  expect(await screen.findByText(/todavía no se puede guardar/)).toBeTruthy();
});

test("hides itself when Google is unavailable (503)", async () => {
  claimTicket.mockRejectedValue(new ApiError("off", 503));
  const { container } = renderWithProviders(<ClaimOrderButton token={TOKEN} />);
  await userEvent.click(
    screen.getByRole("button", { name: "Guardar con Google" }),
  );
  await waitFor(() => expect(container.textContent).toBe(""));
});

test("in an in-app browser it shows instructions and copy link, and never calls the API", async () => {
  vi.spyOn(window.navigator, "userAgent", "get").mockReturnValue(IN_APP_UA);
  const writeText = vi.fn().mockResolvedValue(undefined);
  Object.assign(navigator, { clipboard: { writeText } });
  renderWithProviders(<ClaimOrderButton token={TOKEN} />);

  expect(await screen.findByText("Ábrelo en tu navegador")).toBeTruthy();
  expect(
    screen.queryByRole("button", { name: "Guardar con Google" }),
  ).toBeNull();

  await userEvent.click(screen.getByRole("button", { name: "Copiar enlace" }));
  expect(writeText).toHaveBeenCalledWith(
    `https://biasmarket.com/es/store/k/pedido/${TOKEN}`,
  );
  expect(await screen.findByText("Enlace copiado")).toBeTruthy();
  expect(claimTicket).not.toHaveBeenCalled();
  expect(assign).not.toHaveBeenCalled();
});
