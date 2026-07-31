import { z } from "zod";

export const deliveryMethodSchema = z.object({
  type: z.enum(["PICKUP", "COURIER"]),
  enabled: z.boolean(),
  details: z.record(z.string(), z.unknown()),
});

export const deliveryMethodListSchema = z.array(deliveryMethodSchema);

export const pickupPointSchema = z.object({
  id: z.string(),
  label: z.string(),
  enabled: z.boolean(),
  sortOrder: z.number(),
});

export const pickupPointListSchema = z.array(pickupPointSchema);

export type DeliveryMethod = z.infer<typeof deliveryMethodSchema>;
export type PickupPoint = z.infer<typeof pickupPointSchema>;

export const isNewPickupPoint = (id: string) => id.startsWith("new:");
