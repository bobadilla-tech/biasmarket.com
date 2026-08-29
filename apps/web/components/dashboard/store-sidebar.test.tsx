import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { NextIntlClientProvider } from "next-intl";
import { getMessages } from "@biasmarket/i18n";
import { axe, expectNoA11yViolations } from "@/test-utils/axe";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  usePathname: () => "/dashboard/demo/products",
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
const restockMock = vi.hoisted(() => ({ count: vi.fn() }));
vi.mock("@/lib/api-client", () => ({
  apiClient: { notifications: notificationsMock, restock: restockMock },
}));

const { StoreSidebar } = await import("./store-sidebar");

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

function renderSidebar() {
  vi.stubGlobal("localStorage", createMemoryStorage());
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <NextIntlClientProvider locale="es" messages={getMessages("es")}>
      <QueryClientProvider client={queryClient}>
        <StoreSidebar slug="demo" store={{ id: "store-1" } as never} />
      </QueryClientProvider>
    </NextIntlClientProvider>,
  );
}

beforeEach(() => {
  restockMock.count.mockResolvedValue({ count: 0 });
});

afterEach(() => {
  cleanup();
  notificationsMock.unreadCount.mockReset();
  restockMock.count.mockReset();
});

test("hides the badge when unread count is 0", async () => {
  notificationsMock.unreadCount.mockResolvedValue({ count: 0 });
  renderSidebar();

  await screen.findByText("Notificaciones");
  expect(screen.queryByText("0")).toBeNull();
});

test("renders the unread count on the notifications nav badge", async () => {
  notificationsMock.unreadCount.mockResolvedValue({ count: 4 });
  renderSidebar();

  expect(await screen.findByText("4")).toBeDefined();
});

test("truncates counts above 9 to '9+'", async () => {
  notificationsMock.unreadCount.mockResolvedValue({ count: 25 });
  renderSidebar();

  expect(await screen.findByText("9+")).toBeDefined();
});

test("renders the restock count on the restock nav badge", async () => {
  notificationsMock.unreadCount.mockResolvedValue({ count: 0 });
  restockMock.count.mockResolvedValue({ count: 3 });
  renderSidebar();

  expect(await screen.findByText("Reposición")).toBeDefined();
  expect(await screen.findByText("3")).toBeDefined();
});

test("hides the restock badge when the count is 0", async () => {
  notificationsMock.unreadCount.mockResolvedValue({ count: 0 });
  renderSidebar();

  await screen.findByText("Reposición");
  expect(screen.queryByText("0")).toBeNull();
});

test("exposes a labelled navigation with a current page and collapsed names", async () => {
  notificationsMock.unreadCount.mockResolvedValue({ count: 0 });
  renderSidebar();

  const navigation = await screen.findByRole("navigation", {
    name: "Navegación principal",
  });
  expect(
    screen
      .getByRole("link", { name: "Productos" })
      .getAttribute("aria-current"),
  ).toBe("page");

  const collapseButton = screen.getByRole("button", {
    name: "Contraer barra lateral",
  });
  collapseButton.click();
  expect(screen.getByRole("link", { name: "Productos" })).toBeDefined();
  expectNoA11yViolations(await axe(navigation));
});
