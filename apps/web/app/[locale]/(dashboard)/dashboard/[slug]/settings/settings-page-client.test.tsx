import { afterEach, expect, test, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { getMessages } from "@biasmarket/i18n";

const { push, replace } = vi.hoisted(() => ({
  push: vi.fn(),
  replace: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  usePathname: () => "/es/dashboard/demo/settings",
  useRouter: () => ({ push, replace }),
  useSearchParams: () => new URLSearchParams("tab=store"),
}));
vi.mock("@/features/stores", () => ({
  useDashboardStore: () => ({
    store: { id: "store-1", name: "Demo", slug: "demo", logoUrl: null },
    loading: false,
  }),
}));
vi.mock("@/features/store-settings", () => ({
  AppearanceSection: () => null,
  DefaultsSection: () => null,
  DeliverySection: () => null,
  NotificationsSection: () => null,
  PaymentsSection: () => null,
  ProfileSection: () => null,
  StoreContentSection: () => null,
  useWhatsAppTemplates: () => ({ data: undefined, isPending: false }),
  WhatsAppMessagesSection: () => null,
}));
vi.mock("@/features/couriers", () => ({ CouriersSection: () => null }));
vi.mock(
  "@/features/store-settings/components/register-preference-section",
  () => ({ RegisterPreferenceSection: () => null }),
);

const { SettingsPageClient } = await import("./settings-page-client");

afterEach(() => vi.clearAllMocks());

test("renders five accessible tabs and updates the URL when changing sections", () => {
  render(
    <NextIntlClientProvider locale="es" messages={getMessages("es")}>
      <SettingsPageClient />
    </NextIntlClientProvider>,
  );

  const tabs = screen.getAllByRole("tab");
  expect(tabs).toHaveLength(5);
  expect(
    screen.getByRole("tabpanel", { name: "Perfil de la tienda" }),
  ).toBeTruthy();

  fireEvent.click(
    screen.getByRole("tab", { name: "Métodos de pago aceptados" }),
  );
  expect(push).toHaveBeenCalledWith(
    "/es/dashboard/demo/settings?tab=payments",
    { scroll: false },
  );
});

test("keeps a visited tab mounted and advances focus for consecutive arrow keys", () => {
  render(
    <NextIntlClientProvider locale="es" messages={getMessages("es")}>
      <SettingsPageClient />
    </NextIntlClientProvider>,
  );

  const storeTab = screen.getByRole("tab", { name: "Perfil de la tienda" });
  fireEvent.click(
    screen.getByRole("tab", { name: "Métodos de pago aceptados" }),
  );

  const storePanel = document.getElementById("settings-panel-store");
  expect(storePanel?.hasAttribute("hidden")).toBe(true);
  expect(storePanel?.isConnected).toBe(true);

  const paymentTab = screen.getByRole("tab", {
    name: "Métodos de pago aceptados",
  });
  fireEvent.keyDown(paymentTab, { key: "ArrowRight" });
  expect(document.activeElement).toBe(
    screen.getByRole("tab", { name: "Entrega" }),
  );
  fireEvent.keyDown(document.activeElement!, { key: "ArrowRight" });
  expect(push).toHaveBeenLastCalledWith(
    "/es/dashboard/demo/settings?tab=appearance",
    { scroll: false },
  );
  expect(storeTab.isConnected).toBe(true);
});
