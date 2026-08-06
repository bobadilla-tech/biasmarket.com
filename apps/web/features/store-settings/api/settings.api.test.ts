import { afterEach, expect, test, vi } from "vitest";

const deliveryConfigMock = { findAll: vi.fn(), upsert: vi.fn() };
const pickupPointsMock = {
  findAll: vi.fn(),
  create: vi.fn(),
  update: vi.fn(),
  remove: vi.fn(),
};
const paymentConfigMock = { findAll: vi.fn(), upsert: vi.fn() };
vi.mock("@/lib/api-client", () => ({
  apiClient: {
    deliveryConfig: deliveryConfigMock,
    pickupPoints: pickupPointsMock,
    paymentConfig: paymentConfigMock,
  },
}));

const { settingsApi } = await import("./settings.api");

afterEach(() => {
  deliveryConfigMock.findAll.mockReset();
  deliveryConfigMock.upsert.mockReset();
  pickupPointsMock.findAll.mockReset();
  pickupPointsMock.create.mockReset();
  pickupPointsMock.update.mockReset();
  pickupPointsMock.remove.mockReset();
  paymentConfigMock.findAll.mockReset();
  paymentConfigMock.upsert.mockReset();
});

test("saveDeliverySettings creates new points, updates existing ones, and deletes removed ones", async () => {
  deliveryConfigMock.upsert.mockResolvedValue({});
  pickupPointsMock.create.mockResolvedValue({});
  pickupPointsMock.update.mockResolvedValue({});
  pickupPointsMock.remove.mockResolvedValue({});

  await settingsApi.saveDeliverySettings("store-1", {
    pickupEnabled: true,
    courierEnabled: false,
    courierCost: 15,
    points: [
      { id: "new:123", label: "New spot", enabled: true, sortOrder: 1 },
      {
        id: "existing-1",
        label: "Existing spot",
        enabled: false,
        sortOrder: 0,
      },
    ],
    deletedPointIds: ["deleted-1"],
  });

  expect(deliveryConfigMock.upsert).toHaveBeenCalledWith("store-1", {
    type: "PICKUP",
    enabled: true,
    details: {},
  });
  expect(deliveryConfigMock.upsert).toHaveBeenCalledWith("store-1", {
    type: "COURIER",
    enabled: false,
    details: { estimatedCost: 15 },
  });
  expect(pickupPointsMock.create).toHaveBeenCalledWith("store-1", {
    label: "New spot",
    enabled: true,
    sortOrder: 1,
  });
  expect(pickupPointsMock.update).toHaveBeenCalledWith(
    "store-1",
    "existing-1",
    {
      label: "Existing spot",
      enabled: false,
      sortOrder: 0,
    },
  );
  expect(pickupPointsMock.remove).toHaveBeenCalledWith("store-1", "deleted-1");
});

test("getDeliverySettings returns both methods and points", async () => {
  deliveryConfigMock.findAll.mockResolvedValue([
    { type: "PICKUP", enabled: true, details: {} },
  ]);
  pickupPointsMock.findAll.mockResolvedValue([
    { id: "p1", label: "Main", enabled: true, sortOrder: 0 },
  ]);

  const result = await settingsApi.getDeliverySettings("store-1");

  expect(result.methods).toHaveLength(1);
  expect(result.points).toHaveLength(1);
});

test("savePaymentMethods upserts all four methods with their enabled state", async () => {
  paymentConfigMock.upsert.mockResolvedValue({});

  await settingsApi.savePaymentMethods("store-1", { YAPE: false, CASH: true });

  expect(paymentConfigMock.upsert).toHaveBeenCalledTimes(4);
  expect(paymentConfigMock.upsert).toHaveBeenCalledWith("store-1", {
    method: "YAPE",
    enabled: false,
  });
});

test("getEnabledPaymentMethods hits the enabled=1 filter and returns a plain method list", async () => {
  paymentConfigMock.findAll.mockResolvedValue([
    { method: "YAPE" },
    { method: "CASH" },
  ]);

  const result = await settingsApi.getEnabledPaymentMethods("store-1");

  expect(paymentConfigMock.findAll).toHaveBeenCalledWith(
    "store-1",
    { enabled: "1" },
    { fallbackErrorMessage: undefined },
  );
  expect(result).toEqual(["YAPE", "CASH"]);
});
