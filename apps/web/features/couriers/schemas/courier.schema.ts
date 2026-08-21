import { z } from "zod";

// Local UI-state shape for the couriers editor (features/store-settings's
// delivery section). Mixes persisted couriers (from API) with locally-created
// ones (`id: "new:<timestamp>"`). Runtime-validated before bulk-save.

export const courierModalitySchema = z.object({
  id: z.string(),
  modality: z.enum(["AGENCY", "HOME"]),
  price: z.number().min(0),
  enabled: z.boolean(),
});

export const courierSchema = z.object({
  id: z.string(),
  name: z.string().min(1, "courier name required"),
  enabled: z.boolean(),
  sortOrder: z.number().int().min(0),
  modalities: z.array(courierModalitySchema).min(1, "at least one modality"),
});

export type CourierModality = z.infer<typeof courierModalitySchema>;
export type Courier = z.infer<typeof courierSchema>;

export const isNewCourier = (id: string) => id.startsWith("new:");

export const NEW_COURIER_ID = "new:";
