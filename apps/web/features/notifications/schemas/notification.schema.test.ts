import { expect, test } from "vitest";
import { notificationSchema, unreadCountSchema } from "./notification.schema";

const validItem = {
  id: "notif-1",
  type: "LOW_STOCK",
  title: "Stock bajo",
  body: "Quedan pocas unidades",
  read: false,
  archived: false,
  createdAt: "2026-01-01T00:00:00.000Z",
};

test("parses a valid notification", () => {
  expect(() => notificationSchema.parse(validItem)).not.toThrow();
});

test("throws on an unknown type", () => {
  expect(() => notificationSchema.parse({ ...validItem, type: "UNKNOWN" }))
    .toThrow();
});

test("parses unread-count payload", () => {
  expect(unreadCountSchema.parse({ count: 3 })).toEqual({ count: 3 });
});
