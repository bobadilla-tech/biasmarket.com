import { z } from "zod";

export const signupSchema = z.object({
  name: z.string().min(1),
  email: z.string().min(1).email(),
  password: z.string().min(1),
});

export type SignupInput = z.infer<typeof signupSchema>;
