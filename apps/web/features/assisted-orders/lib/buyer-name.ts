import type { ZodType } from "zod";

// The create-order API keeps `customerName` optional (an alias). The create
// screen still requires a name before submit, matching the buyer-details
// issue, without changing that request contract.
export function withRequiredBuyerName<T extends ZodType>(schema: T) {
  return schema.superRefine((value, ctx) => {
    const name =
      value &&
      typeof value === "object" &&
      "customerName" in value &&
      typeof value.customerName === "string"
        ? value.customerName
        : "";
    if (!name.trim()) {
      ctx.addIssue({
        code: "custom",
        message: "alias required",
        path: ["customerName"],
      });
    }
  });
}
