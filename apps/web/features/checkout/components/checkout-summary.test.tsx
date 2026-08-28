import { expect, test } from "vitest";
import { screen } from "@testing-library/react";
import { renderWithProviders } from "../../../test-utils/render-with-providers";
import type { CartItem } from "@/lib/cart";
import { CheckoutSummary } from "./checkout-summary";

// Post-fix (PR E): payNow mirrors the server's operator order + rounding —
// `((total * pct) / 100).toFixed(2)` — instead of the old
// `total * (pct / 100)` float. Same inputs that produced "0.22" under the
// old expression now produce "0.23".

const item = (over: Partial<CartItem> = {}): CartItem => ({
  productId: "p1",
  variantId: undefined,
  name: "Photocard Set",
  price: 1,
  currency: "PEN",
  quantity: 1,
  ...over,
});

function rowText(label: string) {
  return screen.getByText(label).parentElement?.textContent ?? "";
}

test("FULL payment shows a single total row and no pay-now / pending split", () => {
  renderWithProviders(
    <CheckoutSummary items={[item({ price: 15 })]} deliveryCost={5} />,
  );

  expect(rowText("Total")).toContain("20.00");
  expect(screen.queryByText("Pagar ahora")).toBeNull();
  expect(screen.queryByText("Saldo pendiente")).toBeNull();
});

test("depositPercent 100 is treated as full payment even when paymentType is PARTIAL", () => {
  renderWithProviders(
    <CheckoutSummary
      items={[item({ price: 15 })]}
      paymentType="PARTIAL"
      depositPercent={100}
    />,
  );

  expect(screen.queryByText("Pagar ahora")).toBeNull();
  expect(rowText("Total")).toContain("15.00");
});

test("PARTIAL payment splits total / pay-now / pending, deposit base includes delivery", () => {
  // total = 1.00 (item) + 0.50 (delivery) = 1.50; 15% deposit.
  renderWithProviders(
    <CheckoutSummary
      items={[item({ price: 1 })]}
      deliveryCost={0.5}
      paymentType="PARTIAL"
      depositPercent={15}
    />,
  );

  expect(rowText("Total del pedido")).toContain("1.50");
  // Server-mirrored `((1.5 * 15) / 100).toFixed(2)` -> "0.23".
  expect(rowText("Pagar ahora")).toContain("0.23");
  expect(rowText("Saldo pendiente")).toContain("1.27");
});

test("PARTIAL with no configured deposit percent (<100 gate) falls back to full", () => {
  renderWithProviders(
    <CheckoutSummary items={[item({ price: 10 })]} paymentType="PARTIAL" />,
  );

  expect(screen.queryByText("Pagar ahora")).toBeNull();
  expect(rowText("Total")).toContain("10.00");
});
