import { afterEach, expect, test, vi } from "vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { NextIntlClientProvider } from "next-intl";
import { getMessages } from "@biasmarket/i18n";

const pathname = vi.hoisted(() => ({ value: "/dashboard/demo/products" }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  usePathname: () => pathname.value,
  redirect: vi.fn(),
  permanentRedirect: vi.fn(),
}));

vi.mock("@/lib/auth-client", () => ({
  authClient: {
    useSession: () => ({ data: null }),
    signOut: vi.fn(),
  },
}));

const notificationsMock = vi.hoisted(() => ({ unreadCount: vi.fn() }));
vi.mock("@/features/notifications", () => ({
  useUnreadCount: notificationsMock.unreadCount,
}));
vi.mock("@/features/restock", () => ({
  useRestockCount: () => ({ data: { count: 0 } }),
}));

const { MobileSidebar } = await import("./mobile-sidebar");

function createMemoryStorage(): Storage {
  const store = new Map<string, string>();
  return {
    getItem: (key) => store.get(key) ?? null,
    setItem: (key, value) => void store.set(key, value),
    removeItem: (key) => void store.delete(key),
    clear: () => store.clear(),
    key: (index) => Array.from(store.keys())[index] ?? null,
    get length() {
      return store.size;
    },
  };
}

afterEach(() => {
  cleanup();
  notificationsMock.unreadCount.mockReset();
  pathname.value = "/dashboard/demo/products";
});

test("mobile sheet keeps grouped navigation and closes after route changes", async () => {
  notificationsMock.unreadCount.mockReturnValue({ data: { count: 3 } });
  vi.stubGlobal("localStorage", createMemoryStorage());
  globalThis.localStorage.setItem("store-sidebar-collapsed", "true");

  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });

  const view = render(
    <NextIntlClientProvider locale="es" messages={getMessages("es")}>
      <QueryClientProvider client={queryClient}>
        <MobileSidebar slug="demo" store={null} />
      </QueryClientProvider>
    </NextIntlClientProvider>,
  );

  fireEvent.click(screen.getByRole("button", { name: "Abrir menú" }));

  expect(
    screen.getByRole("dialog", { name: "Navegación de tienda" }),
  ).toBeDefined();

  // Nav labels only render in expanded mode — a collapsed rail hides them
  // and shows icons only. Finding them proves collapse state didn't leak
  // from localStorage into the mobile sheet.
  expect(screen.getByText("Pedidos")).toBeDefined();
  expect(screen.getByText("Productos")).toBeDefined();
  expect(screen.getByText("Cerrar sesión")).toBeDefined();
  expect(screen.getByText("3")).toBeDefined();
  expect(
    screen
      .getByRole("button", { name: "Catálogo" })
      .getAttribute("aria-expanded"),
  ).toBe("true");

  pathname.value = "/dashboard/demo/orders";
  view.rerender(
    <NextIntlClientProvider locale="es" messages={getMessages("es")}>
      <QueryClientProvider client={queryClient}>
        <MobileSidebar slug="demo" store={null} />
      </QueryClientProvider>
    </NextIntlClientProvider>,
  );
  await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
});
