import { z } from "zod";

export const PUSH_JOB_NAME = "send-expo-push";
export const expoPushPayloadSchema = z.object({
  to: z.string().startsWith("ExponentPushToken["),
  title: z.string().min(1).max(128),
  body: z.string().min(1).max(512),
  data: z.record(z.string(), z.unknown()).optional(),
});
export type ExpoPushPayload = z.infer<typeof expoPushPayloadSchema>;
