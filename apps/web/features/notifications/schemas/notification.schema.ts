import { z } from "zod";

export const notificationSchema = z.object({
  id: z.string(),
  type: z.enum(["LOW_STOCK", "OUT_OF_STOCK"]),
  title: z.string(),
  body: z.string(),
  read: z.boolean(),
  archived: z.boolean(),
  createdAt: z.string(),
});

export const notificationListSchema = z.array(notificationSchema);

export const unreadCountSchema = z.object({
  count: z.number(),
});

export type NotificationItem = z.infer<typeof notificationSchema>;
