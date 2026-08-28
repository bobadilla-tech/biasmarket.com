import { afterEach, expect, test, vi } from "vitest";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithProviders } from "@/test-utils/render-with-providers";
import type { Courier } from "../schemas/courier.schema";

const useCouriers = vi.fn();
const mutate = vi.fn();
const saveState = {
  mutate,
  isPending: false,
  isSuccess: false,
  isError: false,
  error: null as unknown,
  reset: vi.fn(),
};

vi.mock("../queries/use-couriers", () => ({
  couriersKeys: { byStore: (id: string) => ["couriers", id] },
  useCouriers: (...args: unknown[]) => useCouriers(...args),
}));
vi.mock("../mutations/use-save-couriers", () => ({
  useSaveCouriers: () => saveState,
}));

const { CouriersSection } = await import("./couriers-section");

afterEach(() => {
  vi.clearAllMocks();
  saveState.isSuccess = false;
  saveState.isError = false;
});

function existingCourier(): Courier {
  return {
    id: "c1",
    name: "Shalom",
    enabled: true,
    sortOrder: 0,
    modalities: [{ id: "m1", modality: "AGENCY", price: 4, enabled: true }],
  };
}

test("adds a courier, sets both modality prices, and saves the bulk payload", async () => {
  useCouriers.mockReturnValue({ data: [], isLoading: false });
  const user = userEvent.setup();
  renderWithProviders(<CouriersSection storeId="store-1" />);

  await user.click(screen.getByRole("button", { name: "Agregar courier" }));

  await user.type(screen.getByPlaceholderText(/Nombre del courier/), "Olva");

  // emptyCourier() seeds AGENCY + HOME on, so both price inputs are present.
  const agencyPrice = screen.getByLabelText("Costo de agencia");
  const homePrice = screen.getByLabelText("Costo de domicilio");
  await user.clear(agencyPrice);
  await user.type(agencyPrice, "5");
  await user.clear(homePrice);
  await user.type(homePrice, "8");

  await user.click(screen.getByRole("button", { name: "Guardar" }));

  expect(mutate).toHaveBeenCalledTimes(1);
  const [payload] = mutate.mock.calls[0];
  expect(payload.deletedIds).toEqual([]);
  expect(payload.couriers).toHaveLength(1);
  expect(payload.couriers[0].name).toBe("Olva");
  const byModality = Object.fromEntries(
    payload.couriers[0].modalities.map(
      (m: { modality: string; price: number }) => [m.modality, m.price],
    ),
  );
  expect(byModality).toEqual({ AGENCY: 5, HOME: 8 });
});

test("toggling a modality off drops it from the saved payload", async () => {
  useCouriers.mockReturnValue({ data: [existingCourier()], isLoading: false });
  const user = userEvent.setup();
  renderWithProviders(<CouriersSection storeId="store-1" />);

  // One courier row -> switches are [courier.enabled, AGENCY, HOME].
  // Shalom starts AGENCY-only: enable HOME, then disable AGENCY.
  const switches = screen.getAllByRole("switch");
  await user.click(switches[2]);
  await user.click(switches[1]);

  await user.click(screen.getByRole("button", { name: "Guardar" }));

  const [payload] = mutate.mock.calls[0];
  expect(payload.couriers[0].id).toBe("c1");
  expect(
    payload.couriers[0].modalities.map((m: { modality: string }) => m.modality),
  ).toEqual(["HOME"]);
});

test("removing an existing courier sends its id in deletedIds", async () => {
  useCouriers.mockReturnValue({ data: [existingCourier()], isLoading: false });
  const user = userEvent.setup();
  renderWithProviders(<CouriersSection storeId="store-1" />);

  await user.click(screen.getByRole("button", { name: "Eliminar courier" }));
  expect(screen.queryByDisplayValue("Shalom")).toBeNull();

  await user.click(screen.getByRole("button", { name: "Guardar" }));
  const [payload] = mutate.mock.calls[0];
  expect(payload.deletedIds).toEqual(["c1"]);
  expect(payload.couriers).toEqual([]);
});
