import { expect, test } from "vitest";
import {
  extraCourierErrors,
  parsePaidAmountCents,
  proofFieldErrors,
} from "./create-order-payment";

const today = "2026-11-25";
const png = { name: "boleta.png", type: "image/png", size: 1200 };

test("treats blank and zero as no payment, and rejects junk amounts", () => {
  expect(parsePaidAmountCents("")).toBe(0);
  expect(parsePaidAmountCents("0.00")).toBe(0);
  expect(parsePaidAmountCents("12.5")).toBe(1250);
  expect(parsePaidAmountCents("1e2")).toBe("invalid");
});

test("a positive amount needs a receipt unless the method is cash", () => {
  expect(
    proofFieldErrors({
      amount: "10.00",
      method: "YAPE",
      file: null,
      maxCents: 2500,
      today,
    }),
  ).toEqual({ file: "fileRequired" });

  expect(
    proofFieldErrors({
      amount: "10.00",
      method: "YAPE",
      file: png,
      maxCents: 2500,
      today,
    }),
  ).toEqual({});

  expect(
    proofFieldErrors({
      amount: "10.00",
      method: "CASH",
      file: null,
      maxCents: 2500,
      today,
    }),
  ).toEqual({});
});

test("rejects an amount above the order total and a receipt with no amount", () => {
  expect(
    proofFieldErrors({
      amount: "40.00",
      method: "YAPE",
      file: png,
      maxCents: 2500,
      today,
    }).amount,
  ).toBe("amountTooHigh");

  expect(
    proofFieldErrors({
      amount: "0.00",
      method: "YAPE",
      file: png,
      maxCents: 2500,
      today,
    }),
  ).toEqual({ amount: "amountRequired" });
});

test("courier shipping asks for the address fields the screen shows", () => {
  const base = {
    deliveryMethodType: "COURIER",
    courierModality: "AGENCY" as const,
    shippingRecipientSurnames: "",
    shippingDocumentType: "" as const,
    shippingDocumentNumber: "",
    shippingDepartment: "",
    shippingProvince: "",
    shippingDistrict: "",
  };
  expect(extraCourierErrors(base)).toMatchObject({
    shippingRecipientSurnames: "surnames required",
    shippingDocumentType: "document type required",
    shippingDistrict: "district required",
  });
  expect(
    extraCourierErrors({
      ...base,
      shippingRecipientSurnames: "Pérez",
      shippingDocumentType: "DNI",
      shippingDocumentNumber: "12345678",
      shippingDepartment: "Lima",
      shippingProvince: "Lima",
      shippingDistrict: "Miraflores",
    }),
  ).toEqual({});
  expect(
    extraCourierErrors({ ...base, deliveryMethodType: "PICKUP" }),
  ).toEqual({});
});
