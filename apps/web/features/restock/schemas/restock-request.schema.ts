import { z } from "zod";

export const restockRequestFormSchema = z.object({
  name: z.string().min(1, "name required"),
  phone: z.string().min(1, "phone required"),
});

export type RestockRequestFormInput = z.infer<typeof restockRequestFormSchema>;

export type RestockRequestPayload = {
  name: string;
  phone: string;
  productId: string;
  variantId?: string;
};

export const restockRequestResultSchema = z.object({
  id: z.string(),
  createdAt: z.string(),
});

export const restockRequestSchema = z.object({
  id: z.string(),
  name: z.string(),
  phone: z.string(),
  createdAt: z.string(),
  product: z.object({
    id: z.string(),
    name: z.string(),
    images: z.array(z.string()),
  }),
  variant: z.object({
    id: z.string(),
    name: z.string(),
  }).nullable(),
});

export const restockRequestListSchema = z.array(restockRequestSchema);

export type RestockRequest = z.infer<typeof restockRequestSchema>;
