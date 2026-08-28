import { expect, test } from "vitest";
import { screen } from "@testing-library/react";
import { renderWithProviders } from "../../../test-utils/render-with-providers";
import type { CartItem } from "@/lib/cart";
import { CheckoutSummary } from "./checkout-summary";

// PR A pins the CURRENT float math: `payNow = total * (depositPercent / 100)`.
// PR E edits this file to the post-fix operator order `(total * pct) / 100`
// then `.toFixed(2)`, which mirrors the server's `Prisma.Decimal` path — the
// `0.22` below becomes `0.23` for the same inputs.

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
  // Current float expression `1.5 * (15 / 100)` -> 0.2249999… -> "0.22".
  expect(rowText("Pagar ahora")).toContain("0.22");
  expect(rowText("Saldo pendiente")).toContain("1.27");
});

test("PARTIAL with no configured deposit percent (<100 gate) falls back to full", () => {
  renderWithProviders(
    <CheckoutSummary items={[item({ price: 10 })]} paymentType="PARTIAL" />,
  );

  expect(screen.queryByText("Pagar ahora")).toBeNull();
  expect(rowText("Total")).toContain("10.00");
});
