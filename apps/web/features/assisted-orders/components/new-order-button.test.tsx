import { expect, test, vi } from "vitest";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithProviders } from "../../../test-utils/render-with-providers";

const { push } = vi.hoisted(() => ({ push: vi.fn() }));
vi.mock("@/i18n/navigation", () => ({ useRouter: () => ({ push }) }));

const { NewOrderButton } = await import("./new-order-button");

test("'Nuevo pedido' navigates to the assisted-order form of the store", async () => {
  renderWithProviders(<NewOrderButton slug="mi-tienda" />);
  await userEvent.click(screen.getByRole("button", { name: "Nuevo pedido" }));
  expect(push).toHaveBeenCalledWith("/dashboard/mi-tienda/orders/new");
});
