import type { CheckoutFormInput } from "@biasmarket/validation";

export type CourierAddressField =
  | "shippingDepartment"
  | "shippingProvince"
  | "shippingDistrict"
  | "shippingLine1"
  | "shippingCity"
  | "shippingReference"
  | "shippingAgencyName";

export interface CourierFieldGroup {
  id: "location" | "destination";
  fields: readonly CourierAddressField[];
}

const LOCATION_FIELDS = [
  "shippingDepartment",
  "shippingProvince",
  "shippingDistrict",
] as const satisfies readonly CourierAddressField[];

export function courierFieldGroups(
  modality: CheckoutFormInput["courierModality"],
): readonly CourierFieldGroup[] {
  if (modality !== "HOME" && modality !== "AGENCY") return [];

  const destinationFields: readonly CourierAddressField[] =
    modality === "HOME"
      ? ["shippingLine1", "shippingCity", "shippingReference"]
      : modality === "AGENCY"
        ? ["shippingAgencyName"]
        : [];

  return [
    { id: "location", fields: LOCATION_FIELDS },
    { id: "destination", fields: destinationFields },
  ];
}

export function courierFieldLabelKey(field: CourierAddressField): string {
  switch (field) {
    case "shippingDepartment":
      return "department";
    case "shippingProvince":
      return "province";
    case "shippingDistrict":
      return "district";
    case "shippingLine1":
      return "address";
    case "shippingCity":
      return "city";
    case "shippingReference":
      return "reference";
    case "shippingAgencyName":
      return "agencyName";
  }
}
