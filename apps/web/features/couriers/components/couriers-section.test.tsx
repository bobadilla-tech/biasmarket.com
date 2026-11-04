import { afterEach, expect, test, vi } from "vitest";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithProviders } from "../../../test-utils/render-with-providers";
import { withSettingsDraftActions } from "../../../test-utils/settings-draft-test-actions";

const { findAll, bulkSave } = vi.hoisted(() => ({
  findAll: vi.fn(),
  bulkSave: vi.fn(),
}));

vi.mock("@/lib/api-client", () => ({
  apiClient: { couriers: { findAll, bulkSave } },
}));

const { CouriersSection } = await import("./couriers-section");

afterEach(() => {
  vi.clearAllMocks();
  vi.restoreAllMocks();
});

test("asks before removing a saved courier and keeps it when removal is canceled", async () => {
  findAll.mockResolvedValue([
    {
      id: "courier-1",
      name: "Olva",
      enabled: true,
      sortOrder: 0,
      modalities: [
        { id: "modality-1", modality: "HOME", price: "12.00", enabled: true },
      ],
    },
  ]);
  const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
  const user = userEvent.setup();
  renderWithProviders(
    withSettingsDraftActions(
      <CouriersSection storeId="store-1" />,
      "delivery",
    ),
  );

  await screen.findByDisplayValue("Olva");
  await user.click(screen.getByRole("button", { name: "Eliminar courier" }));

  expect(confirm).toHaveBeenCalledWith(
    expect.stringContaining("Los pedidos anteriores conservarán el nombre del courier"),
  );
  expect(screen.getByDisplayValue("Olva")).toBeDefined();
});
