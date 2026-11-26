import { buildSellerPaymentSchema } from "@biasmarket/validation";
import type { AssistedOrderFormInput } from "@biasmarket/validation";

const AMOUNT_PATTERN = /^\d{1,9}(\.\d{1,2})?$/;

// Empty and explicit zero mean "record no payment with this order". Anything
// else must be a seller-payment amount. Returns cents, or "invalid".
export function parsePaidAmountCents(value: string): number | "invalid" {
  const trimmed = value.trim();
  if (
    trimmed === "" ||
    trimmed === "0" ||
    trimmed === "0.0" ||
    trimmed === "0.00"
  ) {
    return 0;
  }
  if (!AMOUNT_PATTERN.test(trimmed)) return "invalid";
  const cents = Math.round(Number(trimmed) * 100);
  if (!Number.isFinite(cents) || cents < 0) return "invalid";
  return cents;
}

export function proofFieldErrors(input: {
  amount: string;
  method: string;
  file: { name: string; type?: string; size: number } | null;
  maxCents: number;
  today: string;
}): { amount?: string; file?: string } {
  const parsed = parsePaidAmountCents(input.amount);
  if (parsed === "invalid") return { amount: "amountInvalid" };
  if (parsed === 0) {
    return input.file ? { amount: "amountRequired" } : {};
  }
  const result = buildSellerPaymentSchema(
    input.maxCents,
    input.today,
  ).safeParse({
    amount: input.amount.trim(),
    method: input.method,
    operationCode: "",
    paidAt: input.today,
    note: "",
    file: input.file,
  });
  if (result.success) return {};
  const errors: { amount?: string; file?: string } = {};
  for (const issue of result.error.issues) {
    const key = issue.path[0];
    if (key === "amount" && !errors.amount) errors.amount = issue.message;
    if (key === "file" && !errors.file) errors.file = issue.message;
  }
  return errors;
}

// The address block on the create-order screen asks for these on top of the
// shared assisted-order schema (name, phone, agency or street).
export function extraCourierErrors(
  values: Pick<
    AssistedOrderFormInput,
    | "deliveryMethodType"
    | "courierModality"
    | "shippingRecipientSurnames"
    | "shippingDocumentType"
    | "shippingDocumentNumber"
    | "shippingDepartment"
    | "shippingProvince"
    | "shippingDistrict"
  >,
): Partial<
  Record<
    | "shippingRecipientSurnames"
    | "shippingDocumentType"
    | "shippingDocumentNumber"
    | "shippingDepartment"
    | "shippingProvince"
    | "shippingDistrict",
    string
  >
> {
  if (values.deliveryMethodType !== "COURIER" || !values.courierModality) {
    return {};
  }
  const errors: ReturnType<typeof extraCourierErrors> = {};
  if (!values.shippingRecipientSurnames.trim()) {
    errors.shippingRecipientSurnames = "surnames required";
  }
  if (!values.shippingDocumentType) {
    errors.shippingDocumentType = "document type required";
  }
  if (!values.shippingDocumentNumber.trim()) {
    errors.shippingDocumentNumber = "document number required";
  }
  if (!values.shippingDepartment.trim()) {
    errors.shippingDepartment = "department required";
  }
  if (!values.shippingProvince.trim()) {
    errors.shippingProvince = "province required";
  }
  if (!values.shippingDistrict.trim()) {
    errors.shippingDistrict = "district required";
  }
  return errors;
}
