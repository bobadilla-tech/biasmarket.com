import { z } from "zod";

export const customerChangePasswordSchema = z
  .object({
    currentPassword: z.string().min(1),
    newPassword: z.string().min(8),
    confirmNewPassword: z.string().min(1),
  })
  .refine((data) => data.newPassword === data.confirmNewPassword, {
    message: "passwordsDontMatch",
    path: ["confirmNewPassword"],
  });

export type CustomerChangePasswordInput = z.infer<
  typeof customerChangePasswordSchema
>;
