import { afterEach, expect, test, vi } from "vitest";
import { fireEvent, screen, waitFor } from "@testing-library/react";
import { renderWithProviders } from "../../../test-utils/render-with-providers";
import { withSettingsDraftActions } from "../../../test-utils/settings-draft-test-actions";
import { dashboardStoreKeys } from "@/features/stores";

vi.mock("next/navigation", async (importOriginal) => ({
  ...(await importOriginal<typeof import("next/navigation")>()),
  useParams: () => ({ slug: "test-store", locale: "es" }),
}));

const { findAllPaymentConfig, updateStore } = vi.hoisted(() => ({
  findAllPaymentConfig: vi.fn(),
  updateStore: vi.fn(),
}));

vi.mock("@/lib/api-client", () => ({
  apiClient: {
    paymentConfig: {
      findAll: findAllPaymentConfig,
      upsert: vi.fn(),
    },
    stores: { update: updateStore },
  },
}));

const { PaymentsSection } = await import("./payments-section");

afterEach(() => {
  vi.clearAllMocks();
  updateStore.mockResolvedValue({});
});

test("loads saved payment instructions into the editor", async () => {
  findAllPaymentConfig.mockResolvedValue([]);

  renderWithProviders(
    <PaymentsSection
      storeId="store-1"
      initialPaymentInstructions="Pagar al recibir"
    />,
  );
  expect(await screen.findByLabelText("Instrucciones de pago")).toHaveProperty(
    "value",
    "Pagar al recibir",
  );
});

test("saves the edited payment instructions", async () => {
  findAllPaymentConfig.mockResolvedValue([]);

  const { queryClient } = renderWithProviders(
    withSettingsDraftActions(
      <PaymentsSection storeId="store-1" initialPaymentInstructions="" />,
      "payments",
    ),
  );
  queryClient.setQueryData(dashboardStoreKeys.bySlug("test-store"), {
    id: "store-1",
    slug: "test-store",
    paymentInstructions: "",
  });
  updateStore.mockResolvedValue({ paymentInstructions: "Transferir al 999" });

  const editor = await screen.findByLabelText("Instrucciones de pago");
  fireEvent.change(editor, { target: { value: "Transferir al 999" } });
  fireEvent.click(screen.getByRole("button", { name: "Save tab" }));

  await waitFor(() =>
    expect(updateStore).toHaveBeenCalledWith("store-1", {
      paymentInstructions: "Transferir al 999",
    }),
  );
  expect(
    queryClient.getQueryData(dashboardStoreKeys.bySlug("test-store")),
  ).toMatchObject({ paymentInstructions: "Transferir al 999" });
});

test("shows the setup nudge when only CASH (seeded by default) is configured", async () => {
  findAllPaymentConfig.mockResolvedValue([
    { method: "YAPE", enabled: true, details: {} },
    { method: "PLIN", enabled: true, details: {} },
    { method: "TRANSFER", enabled: true, details: {} },
    { method: "CASH", enabled: true, details: {} },
  ]);

  renderWithProviders(
    <PaymentsSection storeId="store-1" initialPaymentInstructions="" />,
  );

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

  renderWithProviders(
    <PaymentsSection storeId="store-1" initialPaymentInstructions="" />,
  );

  await screen.findByText("Yape");
  expect(screen.queryByText(/Configura un método de pago/i)).toBeNull();
});
