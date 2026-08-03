import { z } from "zod";

export const forgotPasswordSchema = z.object({
  phone: z.string().min(1),
});

export type ForgotPasswordInput = z.infer<typeof forgotPasswordSchema>;
