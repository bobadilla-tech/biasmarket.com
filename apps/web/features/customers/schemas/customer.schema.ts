import { z } from "zod";

// `Customers.getOne` (features/customers, not yet migrated to the generated
// client — Batch 5) returns the same shape `Order`'s own `findAll` does
// (OrderRepository.withPaymentSummary's computed paidAmount/pendingAmount/
// paidPercentage, items with product/variant joins, payments — see
// CustomersService.findOneForStore), but `features/orders` dropped its own
// zod schema for this shape once it migrated (Batch 4) since its own
// api/ layer no longer needs to `.parse()` anything. Copied locally
// (not re-imported from `orders`) rather than left depending on a schema
// that feature no longer owns — this one goes away too once `Customers`
// itself migrates.
const orderItemRowSchema = z.object({
  id: z.string(),
  quantity: z.number(),
  product: z.object({
    id: z.string(),
    name: z.string(),
    images: z.array(z.string()).optional(),
  }),
  variant: z.object({ id: z.string(), name: z.string() }).nullable(),
});

const orderPaymentRowSchema = z.object({
  id: z.string(),
  amount: z.string(),
  method: z.string().nullable().optional(),
  note: z.string().nullable().optional(),
  imageUrl: z.string().nullable().optional(),
  createdAt: z.string(),
});

const orderSchema = z.object({
  id: z.string(),
  customerName: z.string().nullable(),
  customerPhone: z.string(),
  totalAmount: z.string(),
  requiredAmount: z.string(),
  paidAmount: z.number(),
  pendingAmount: z.number(),
  paidPercentage: z.number(),
  currency: z.string(),
  paymentRejectionReason: z.string().nullable().optional(),
  status: z.enum(["ACTIVE", "CANCELLED"]),
  paymentStatus: z.enum([
    "PENDING_PAYMENT",
    "PARTIALLY_PAID",
    "PAYMENT_SUBMITTED",
    "VERIFIED",
    "REJECTED",
    "CANCELLED",
  ]),
  fulfillmentStatus: z.enum(["ORDERING", "IN_TRANSIT", "READY", "COMPLETED"]),
  deliveryMethodType: z.enum(["PICKUP", "COURIER"]),
  deliveryDetails: z.record(z.string(), z.unknown()).nullable(),
  createdAt: z.string(),
  items: z.array(orderItemRowSchema),
  payments: z.array(orderPaymentRowSchema),
});

export const customerListItemSchema = z.object({
  id: z.string(),
  name: z.string().nullable(),
  phone: z.string(),
  email: z.string().nullable(),
  emailVerified: z.boolean(),
  createdAt: z.string(),
  orderCount: z.number(),
  lifetimeSpend: z.number(),
  lastOrderAt: z.string().nullable(),
});

export const customerListSchema = z.array(customerListItemSchema);

export const customerDetailSchema = z.object({
  customer: z.object({
    id: z.string(),
    name: z.string().nullable(),
    phone: z.string(),
    email: z.string().nullable(),
    emailVerified: z.boolean(),
    createdAt: z.string(),
  }),
  orders: z.array(orderSchema),
});

export type CustomerListItem = z.infer<typeof customerListItemSchema>;
export type CustomerDetail = z.infer<typeof customerDetailSchema>;
