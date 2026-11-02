import { expect, test, vi } from "vitest";
import { fireEvent, screen } from "@testing-library/react";
import { renderWithProviders } from "../../../test-utils/render-with-providers";
import { makeOrder, TOKEN } from "../test-fixtures";

vi.mock("../api/submit-proof", () => ({ submitProof: vi.fn() }));

const { ProofUploadSection } = await import("./proof-upload-section");

test("opens a remaining-balance dialog with the current balance prefilled", async () => {
  const order = makeOrder({
    paymentStatus: "PARTIALLY_PAID",
    pendingAmount: 27.5,
  });

  renderWithProviders(
    <ProofUploadSection slug="demo-store" token={TOKEN} order={order} />,
  );

  fireEvent.click(
    screen.getByRole("button", { name: "Pagar lo restante · PEN 27.50" }),
  );

  expect(await screen.findByRole("dialog")).toBeTruthy();
  expect(
    (screen.getByLabelText(/Monto pagado/) as HTMLInputElement).value,
  ).toBe("27.50");
  expect(screen.getByLabelText("Elegir captura del pago")).toBeTruthy();
});
