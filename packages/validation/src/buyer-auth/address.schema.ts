import { z } from "zod";

export const addressSchema = z.object({
  label: z.string().optional(),
  recipientName: z.string().min(1),
  phone: z.string().min(1),
  line1: z.string().min(1),
  line2: z.string().optional(),
  city: z.string().min(1),
  region: z.string().optional(),
  reference: z.string().optional(),
});

export type AddressInput = z.infer<typeof addressSchema>;
