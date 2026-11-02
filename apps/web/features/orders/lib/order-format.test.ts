import { expect, test } from "vitest";
import type { OrderResponseDto } from "@biasmarket/types";
import {
  formatShippingDetailsForCopy,
  getShippingAddress,
} from "./order-format";

const labels = {
  courier: "Courier",
  modality: "Modality",
  agencyModality: "Agency pickup",
  homeModality: "Home delivery",
  recipient: "Recipient",
  document: "Document",
  phone: "Phone",
  location: "Location",
  agency: "Agency",
  address: "Address",
  reference: "Reference",
  order: "Order",
};

function order(
  modality: "AGENCY" | "HOME",
  shippingAddress: Record<string, unknown>,
) {
  return {
    id: "order-1",
    deliveryMethodType: "COURIER",
    courierName: "Olva",
    courierModality: modality,
    deliveryDetails: { shippingAddress },
  } as unknown as OrderResponseDto;
}

test("accepts and formats AGENCY addresses without a street or city", () => {
  const data = order("AGENCY", {
    recipientName: "Ana",
    recipientSurnames: "Pérez Gómez",
    phone: "987654321",
    documentType: "DNI",
    documentNumber: "12345678",
    department: "Lima",
    province: "Lima",
    district: "Miraflores",
    agencyName: "Olva Larco",
  });
  const address = getShippingAddress(data);

  expect(address?.agencyName).toBe("Olva Larco");
  expect(formatShippingDetailsForCopy(data, address!, labels)).toBe(
    "Courier: Olva · Agency pickup\nRecipient: Ana Pérez Gómez\nDocument: DNI 12345678\nPhone: 987654321\nLocation: Lima / Lima / Miraflores\nAgency: Olva Larco\nOrder: #RDER-1",
  );
});

test("formats HOME addresses and omits agency fields", () => {
  const data = order("HOME", {
    recipientName: "Ana",
    phone: "987654321",
    department: "Lima",
    district: "Miraflores",
    line1: "Av. Larco 123",
    line2: "Dpto. 4",
    reference: "Frente al parque",
    agencyName: "Ignored agency",
  });
  const address = getShippingAddress(data)!;

  expect(formatShippingDetailsForCopy(data, address, labels)).toContain(
    "Address: Av. Larco 123, Dpto. 4",
  );
  expect(formatShippingDetailsForCopy(data, address, labels)).toContain(
    "Reference: Frente al parque",
  );
  expect(formatShippingDetailsForCopy(data, address, labels)).not.toContain(
    "Ignored agency",
  );
});

test("rejects addresses without recipient name or phone", () => {
  expect(
    getShippingAddress(order("AGENCY", { phone: "987654321" })),
  ).toBeNull();
  expect(
    getShippingAddress(order("AGENCY", { recipientName: "Ana" })),
  ).toBeNull();
});
