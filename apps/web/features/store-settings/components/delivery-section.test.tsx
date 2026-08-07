import { afterEach, expect, test, vi } from "vitest";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithProviders } from "../../../test-utils/render-with-providers";

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
});

test("toggling a weekday off and marking closedOverride, then saving, persists both", async () => {
  findAllDeliveryConfig.mockResolvedValue([
    { type: "PICKUP", enabled: true, details: {} },
  ]);
  findAllPickupPoints.mockResolvedValue([point]);
  upsertDeliveryConfig.mockResolvedValue({});
  updatePickupPoint.mockResolvedValue({});

  const user = userEvent.setup();
  renderWithProviders(<DeliverySection storeId="store-1" />);

  await screen.findByDisplayValue("Alameda 28 de Julio");

  await user.click(
    screen.getByRole("button", { name: /disponibilidad/i }),
  );

  const dialog = screen.getByRole("dialog");
  await user.click(within(dialog).getByRole("button", { name: "Lun" }));
  await user.click(within(dialog).getByRole("switch"));
  await user.click(within(dialog).getByRole("button", { name: "Listo" }));

  await user.click(screen.getByRole("button", { name: "Guardar" }));

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
