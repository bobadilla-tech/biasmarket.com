import { expect, test, vi } from "vitest";

const apiFetch = vi.fn();
vi.mock("@/lib/api", () => ({ apiFetch: (...args: unknown[]) => apiFetch(...args) }));

const { notificationsApi } = await import("./notifications.api");

test("list calls the archived-scoped URL and validates the response", async () => {
  apiFetch.mockResolvedValueOnce([]);

  const result = await notificationsApi.list("store-1", true);

  expect(apiFetch).toHaveBeenCalledWith("/stores/store-1/notifications?archived=true");
  expect(result).toEqual([]);
});

test("unreadCount validates the response shape", async () => {
  apiFetch.mockResolvedValueOnce({ count: 2 });

  const result = await notificationsApi.unreadCount("store-1");

  expect(apiFetch).toHaveBeenCalledWith("/stores/store-1/notifications/unread-count");
  expect(result).toEqual({ count: 2 });
});

test("markRead PATCHes the notification", async () => {
  apiFetch.mockResolvedValueOnce({});

  await notificationsApi.markRead("store-1", "notif-1");

  expect(apiFetch).toHaveBeenCalledWith("/stores/store-1/notifications/notif-1/read", {
    method: "PATCH",
  });
});
