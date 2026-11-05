import { z } from "zod";

export const PUSH_JOB_NAME = "send-expo-push";

export const expoPushTokenSchema = z
  .string()
  .min(20)
  .max(256)
  .regex(/^(Exponent|Expo)PushToken\[[A-Za-z0-9_-]+\]$/);

export const expoPushPayloadSchema = z.object({
  to: expoPushTokenSchema,
  title: z.string().min(1).max(128),
  body: z.string().min(1).max(512),
  data: z.record(z.string(), z.unknown()).optional(),
});

export type ExpoPushPayload = z.infer<typeof expoPushPayloadSchema>;
