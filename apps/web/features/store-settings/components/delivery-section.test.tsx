import { afterEach, expect, test, vi } from "vitest";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithProviders } from "../../../test-utils/render-with-providers";
import { withSettingsDraftActions } from "../../../test-utils/settings-draft-test-actions";

const {
  findAllDeliveryConfig,
  upsertDeliveryConfig,
  findAllPickupPoints,
  updatePickupPoint,
} = vi.hoisted(() => ({
  findAllDeliveryConfig: vi.fn(),
  upsertDeliveryConfig: vi.fn(),
  findAllPickupPoints: vi.fn(),
  updatePickupPoint: vi.fn(),
}));

vi.mock("@/lib/api-client", () => ({
  apiClient: {
    deliveryConfig: {
      findAll: findAllDeliveryConfig,
      upsert: upsertDeliveryConfig,
    },
    pickupPoints: {
      findAll: findAllPickupPoints,
      create: vi.fn(),
      update: updatePickupPoint,
      remove: vi.fn(),
    },
  },
}));

const { DeliverySection } = await import("./delivery-section");

const point = {
  id: "point-1",
  label: "Alameda 28 de Julio",
  enabled: true,
  sortOrder: 0,
  openDays: [1, 2, 3, 4, 5],
  closedOverride: false,
};

afterEach(() => {
  vi.clearAllMocks();
  vi.restoreAllMocks();
});

test("asks before removing a saved pickup point and keeps it when removal is canceled", async () => {
  findAllDeliveryConfig.mockResolvedValue([
    { type: "PICKUP", enabled: true, details: {} },
  ]);
  findAllPickupPoints.mockResolvedValue([point]);
  const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
  const user = userEvent.setup();
  renderWithProviders(
    withSettingsDraftActions(<DeliverySection storeId="store-1" />, "delivery"),
  );

  await screen.findByDisplayValue("Alameda 28 de Julio");
  await user.click(screen.getByRole("button", { name: "Eliminar punto" }));

  expect(confirm).toHaveBeenCalledWith(
    expect.stringContaining(
      "Los pedidos anteriores conservarán sus datos de entrega",
    ),
  );
  expect(screen.getByDisplayValue("Alameda 28 de Julio")).toBeDefined();
});

test("toggling a weekday off and marking closedOverride, then saving, persists both", async () => {
  findAllDeliveryConfig.mockResolvedValue([
    { type: "PICKUP", enabled: true, details: {} },
  ]);
  findAllPickupPoints.mockResolvedValue([point]);
  upsertDeliveryConfig.mockResolvedValue({});
  updatePickupPoint.mockResolvedValue({});

  const user = userEvent.setup();
  renderWithProviders(
    withSettingsDraftActions(<DeliverySection storeId="store-1" />, "delivery"),
  );

  await screen.findByDisplayValue("Alameda 28 de Julio");

  await user.click(screen.getByRole("button", { name: /disponibilidad/i }));

  const dialog = screen.getByRole("dialog");
  await user.click(within(dialog).getByRole("button", { name: "Lun" }));
  await user.click(within(dialog).getByRole("switch"));
  await user.click(within(dialog).getByRole("button", { name: "Listo" }));

  await user.click(screen.getByRole("button", { name: "Save tab" }));

  await waitFor(() => {
    expect(updatePickupPoint).toHaveBeenCalledWith("store-1", "point-1", {
      label: "Alameda 28 de Julio",
      enabled: true,
      sortOrder: 0,
      openDays: [2, 3, 4, 5],
      closedOverride: true,
    });
  });
});
