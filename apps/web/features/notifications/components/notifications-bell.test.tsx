import { afterEach, expect, test, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { NextIntlClientProvider } from "next-intl";
import { getMessages } from "@biasmarket/i18n";
import type { ReactNode } from "react";

const notificationsMock = vi.hoisted(() => ({
  findAll: vi.fn(),
  unreadCount: vi.fn(),
  markRead: vi.fn(),
}));
vi.mock(
  "@/lib/api-client",
  () => ({ apiClient: { notifications: notificationsMock } }),
);

const { NotificationsBell } = await import("./notifications-bell");

function renderBell(storeId: string | undefined) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <NextIntlClientProvider locale="es" messages={getMessages("es")}>
      <QueryClientProvider client={queryClient}>
        <NotificationsBell slug="demo" storeId={storeId} />
      </QueryClientProvider>
    </NextIntlClientProvider>,
  );
}

afterEach(() => {
  cleanup();
  notificationsMock.findAll.mockReset();
  notificationsMock.unreadCount.mockReset();
  notificationsMock.markRead.mockReset();
});

test("hides the badge when unread count is 0", async () => {
  notificationsMock.unreadCount.mockResolvedValue({ count: 0 });
  renderBell("store-1");

  await screen.findByLabelText("Notificaciones");
  expect(screen.queryByText("0")).toBeNull();
});

test("renders the unread count on the badge", async () => {
  notificationsMock.unreadCount.mockResolvedValue({ count: 3 });
  renderBell("store-1");

  expect(await screen.findByText("3")).toBeDefined();
});

test("truncates counts above 9 to '9+'", async () => {
  notificationsMock.unreadCount.mockResolvedValue({ count: 42 });
  renderBell("store-1");

  expect(await screen.findByText("9+")).toBeDefined();
});
