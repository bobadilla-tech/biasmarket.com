import { describe, expect, test } from "vitest";
import {
  buildShippingAddressPayload,
  computeDeliveryCost,
  depositPercentOf,
  isPartialAvailable,
  pickupDateBlocking,
  pointsRequiringDate,
  unconfiguredManualMethods,
} from "./delivery-rules";

const everyDay = { id: "everyday", openDays: [], closedOverride: false };
const monToWed = { id: "monwed", openDays: [1, 2, 3], closedOverride: false };
const closed = { id: "closed", openDays: [], closedOverride: true };
const disabled = {
  id: "disabled",
  openDays: [],
  closedOverride: false,
  enabled: false,
};

describe("pointsRequiringDate", () => {
  test("is empty until the server weekday is known", () => {
    expect(pointsRequiringDate([monToWed, closed], undefined).size).toBe(0);
  });

  test("lists points that are closed today, disabled, or manually closed", () => {
    // Friday (5): Mon-Wed point is closed today.
    const result = pointsRequiringDate(
      [everyDay, monToWed, closed, disabled],
      5,
    );
    expect([...result].sort()).toEqual(["closed", "disabled", "monwed"]);
  });

  test("leaves out points open today", () => {
    expect(pointsRequiringDate([everyDay, monToWed], 2).size).toBe(0);
  });
});

describe("unconfiguredManualMethods", () => {
  test("flags enabled manual methods with empty details, never CASH", () => {
    const result = unconfiguredManualMethods([
      { method: "YAPE", details: {} },
      { method: "PLIN", details: null },
      { method: "TRANSFER", details: { bankName: "BCP", accountNumber: "1" } },
      { method: "CASH", details: {} },
    ]);
    expect([...result].sort()).toEqual(["PLIN", "YAPE"]);
  });

  test("is empty when everything is configured", () => {
    expect(
      unconfiguredManualMethods([
        { method: "YAPE", details: { phoneNumber: "999" } },
      ]).size,
    ).toBe(0);
  });
});

describe("computeDeliveryCost", () => {
  const methods = [
    { type: "PICKUP", details: null },
    { type: "COURIER", details: { estimatedCost: 10 } },
  ];
  const couriers = [
    {
      name: "Olva",
      modalities: [
        { modality: "HOME", price: "12.50" },
        { modality: "AGENCY", price: 8 },
      ],
    },
  ];

  test("uses the courier modality price when a courier is chosen", () => {
    expect(
      computeDeliveryCost({
        deliveryMethodType: "COURIER",
        courierName: "Olva",
        courierModality: "HOME",
        methods,
        couriers,
      }),
    ).toBe(12.5);
  });

  test("falls back to the method's estimatedCost until a modality is chosen", () => {
    expect(
      computeDeliveryCost({
        deliveryMethodType: "COURIER",
        courierName: "Olva",
        methods,
        couriers,
      }),
    ).toBe(10);
  });

  test("is 0 for pickup, unknown courier, or missing cost", () => {
    expect(
      computeDeliveryCost({ deliveryMethodType: "PICKUP", methods, couriers }),
    ).toBe(0);
    expect(
      computeDeliveryCost({
        deliveryMethodType: "COURIER",
        courierName: "Nope",
        courierModality: "HOME",
        methods: [{ type: "COURIER", details: {} }],
        couriers,
      }),
    ).toBe(0);
  });
});

describe("isPartialAvailable / depositPercentOf", () => {
  test("only a non-CASH configured method below 100 allows PARTIAL", () => {
    expect(
      isPartialAvailable("YAPE", { method: "YAPE", depositPercent: 50 }),
    ).toBe(true);
    expect(
      isPartialAvailable("YAPE", { method: "YAPE", depositPercent: 100 }),
    ).toBe(false);
    expect(
      isPartialAvailable("CASH", { method: "CASH", depositPercent: 50 }),
    ).toBe(false);
    expect(isPartialAvailable("YAPE", undefined)).toBe(false);
  });

  test("a non-numeric deposit counts as 100", () => {
    expect(depositPercentOf(undefined)).toBe(100);
    expect(depositPercentOf({ depositPercent: "50" })).toBe(100);
    expect(depositPercentOf({ depositPercent: 30 })).toBe(30);
  });
});

describe("pickupDateBlocking", () => {
  const base = {
    deliveryMethodType: "PICKUP",
    pickupPointId: "monwed",
    pickupDate: "",
    points: [monToWed, closed],
    weekday: 5, // Friday
    requiringDate: new Set(["monwed", "closed"]),
  };

  test("never blocks courier orders, an empty point or a point open today", () => {
    expect(pickupDateBlocking({ ...base, deliveryMethodType: "COURIER" })).toBe(
      false,
    );
    expect(pickupDateBlocking({ ...base, pickupPointId: "" })).toBe(false);
    expect(pickupDateBlocking({ ...base, requiringDate: new Set() })).toBe(
      false,
    );
  });

  test("blocks a missing date", () => {
    expect(pickupDateBlocking(base)).toBe(true);
  });

  test("blocks a date on a closed weekday and accepts one on an open weekday", () => {
    // 2026-11-03 is a Tuesday (open), 2026-11-06 is a Friday (closed).
    expect(pickupDateBlocking({ ...base, pickupDate: "2026-11-03" })).toBe(
      false,
    );
    expect(pickupDateBlocking({ ...base, pickupDate: "2026-11-06" })).toBe(
      true,
    );
  });

  test("always blocks a manually closed point, even with a date", () => {
    expect(
      pickupDateBlocking({
        ...base,
        pickupPointId: "closed",
        pickupDate: "2026-11-03",
      }),
    ).toBe(true);
  });

  test("blocks while the weekday or the point is unknown", () => {
    expect(
      pickupDateBlocking({
        ...base,
        weekday: undefined,
        pickupDate: "2026-11-03",
      }),
    ).toBe(true);
    expect(
      pickupDateBlocking({
        ...base,
        pickupPointId: "ghost",
        requiringDate: new Set(["ghost"]),
        pickupDate: "2026-11-03",
      }),
    ).toBe(true);
  });
});

describe("buildShippingAddressPayload", () => {
  const values = {
    courierModality: "HOME",
    shippingRecipientName: "Ana",
    shippingRecipientSurnames: "",
    shippingPhone: "999111222",
    shippingDocumentType: "",
    shippingDocumentNumber: "",
    shippingDepartment: "Lima",
    shippingProvince: "",
    shippingDistrict: "Miraflores",
    shippingLine1: "Av. Larco 123",
    shippingLine2: "",
    shippingCity: "Lima",
    shippingRegion: "",
    shippingReference: "Frente al parque",
    shippingAgencyName: "Agencia X",
  };

  test("HOME sends line1 and drops agencyName; empty strings become undefined", () => {
    expect(buildShippingAddressPayload(values)).toEqual({
      recipientName: "Ana",
      recipientSurnames: undefined,
      phone: "999111222",
      documentType: undefined,
      documentNumber: undefined,
      department: "Lima",
      province: undefined,
      district: "Miraflores",
      agencyName: undefined,
      line1: "Av. Larco 123",
      line2: undefined,
      city: "Lima",
      region: undefined,
      reference: "Frente al parque",
    });
  });

  test("AGENCY sends agencyName and drops line1", () => {
    const payload = buildShippingAddressPayload({
      ...values,
      courierModality: "AGENCY",
    });
    expect(payload.agencyName).toBe("Agencia X");
    expect(payload.line1).toBeUndefined();
  });
});
