import { z } from "zod";

export const customerRegisterSchema = z
  .object({
    password: z.string().min(8),
    confirmPassword: z.string().min(1),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: "passwordsDontMatch",
    path: ["confirmPassword"],
  });

export type CustomerRegisterInput = z.infer<typeof customerRegisterSchema>;
