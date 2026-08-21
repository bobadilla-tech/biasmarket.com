import { afterEach, expect, test, vi } from "vitest";
import { screen } from "@testing-library/react";
import { renderWithProviders } from "../../../test-utils/render-with-providers";

const { findAllPaymentConfig } = vi.hoisted(() => ({
  findAllPaymentConfig: vi.fn(),
}));

vi.mock("@/lib/api-client", () => ({
  apiClient: {
    paymentConfig: {
      findAll: findAllPaymentConfig,
      upsert: vi.fn(),
    },
  },
}));

const { PaymentsSection } = await import("./payments-section");

afterEach(() => {
  vi.clearAllMocks();
});

test("shows the setup nudge when only CASH (seeded by default) is configured", async () => {
  findAllPaymentConfig.mockResolvedValue([
    { method: "YAPE", enabled: true, details: {} },
    { method: "PLIN", enabled: true, details: {} },
    { method: "TRANSFER", enabled: true, details: {} },
    { method: "CASH", enabled: true, details: {} },
  ]);

  renderWithProviders(<PaymentsSection storeId="store-1" />);

  expect(await screen.findByText(/Configura un método de pago/i)).toBeDefined();
});

test("hides the setup nudge once a real method (e.g. TRANSFER) is configured", async () => {
  findAllPaymentConfig.mockResolvedValue([
    { method: "YAPE", enabled: true, details: {} },
    {
      method: "TRANSFER",
      enabled: true,
      details: { bankName: "BCP", accountNumber: "123", accountHolder: "Jane" },
    },
    { method: "CASH", enabled: true, details: {} },
  ]);

  renderWithProviders(<PaymentsSection storeId="store-1" />);

  await screen.findByText("Yape");
  expect(screen.queryByText(/Configura un método de pago/i)).toBeNull();
});
