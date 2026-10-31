import type { ReactNode } from "react";
import { beforeAll, expect, test, vi } from "vitest";
import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NextIntlClientProvider } from "next-intl";
import { getMessages } from "@biasmarket/i18n";

const update = vi.fn();
const references = [
  {
    id: "visible-1",
    imageUrl: "https://cdn.test/visible.jpg",
    width: 640,
    height: 480,
    takenAt: "2026-10-01T00:00:00.000Z",
    caption: "Delivered safely",
    hidden: false,
    source: "STORE",
  },
  {
    id: "hidden-1",
    imageUrl: "https://cdn.test/hidden.jpg",
    width: 640,
    height: 480,
    takenAt: "2026-09-30T00:00:00.000Z",
    caption: null,
    hidden: true,
    source: "STORE",
  },
];

vi.mock("next/navigation", () => ({ useParams: () => ({ locale: "es" }) }));
vi.mock("@tanstack/react-query", () => ({
  useQuery: () => ({ data: references, isLoading: false, error: null }),
  useQueryClient: () => ({ invalidateQueries: vi.fn() }),
}));
vi.mock("@/features/stores", () => ({
  useDashboardStore: () => ({
    storeId: "store-1",
    loading: false,
    error: null,
  }),
}));
vi.mock("@/features/references/api/references.api", () => ({
  referencesApi: {
    findAll: vi.fn(),
    create: vi.fn(),
    update,
    remove: vi.fn(),
  },
}));
vi.mock("@/lib/api-client", () => ({
  apiClient: { storeReferences: { remove: vi.fn() } },
}));

const { ReferencesPageClient } = await import("./references-page-client");

beforeAll(() => {
  HTMLDialogElement.prototype.showModal = function showModal() {
    this.setAttribute("open", "");
  };
  HTMLDialogElement.prototype.close = function close() {
    this.removeAttribute("open");
  };
});

function Wrapper({ children }: { children: ReactNode }) {
  return (
    <NextIntlClientProvider locale="es" messages={getMessages("es")}>
      {children}
    </NextIntlClientProvider>
  );
}

function renderPage() {
  return render(<ReferencesPageClient />, { wrapper: Wrapper });
}

test("hiding a reference needs no privacy confirmation; publishing does", async () => {
  const user = userEvent.setup();
  update.mockClear();
  renderPage();

  await user.click(screen.getByRole("button", { name: "Ocultar" }));
  await waitFor(() =>
    expect(update).toHaveBeenCalledWith(
      "store-1",
      "visible-1",
      { hidden: true },
      "Error de red",
    ),
  );

  await user.click(screen.getByRole("button", { name: "Publicar" }));
  const dialog = screen.getByRole("dialog", { name: "Publicar referencia" });
  const confirm = within(dialog).getByLabelText(/Antes de publicar, asegúrate/);
  const publish = within(dialog).getByRole("button", { name: "Publicar" });
  expect(publish.hasAttribute("disabled")).toBe(true);
  await user.click(confirm);
  expect(publish.hasAttribute("disabled")).toBe(false);
  await user.click(publish);
  await waitFor(() =>
    expect(update).toHaveBeenLastCalledWith(
      "store-1",
      "hidden-1",
      { hidden: false, privacyConfirmed: true },
      "Error de red",
    ),
  );
  expect(dialog).toBeDefined();
});

test("replacing a reference image asks for privacy confirmation", async () => {
  const user = userEvent.setup();
  renderPage();

  await user.click(screen.getAllByRole("button", { name: "Editar" })[0]!);
  const file = new File(["image"], "replacement.jpg", { type: "image/jpeg" });
  fireEvent.change(screen.getByLabelText("Reemplazar imagen (opcional)"), {
    target: { files: [file] },
  });

  const save = screen.getByRole("button", { name: "Guardar cambios" });
  expect(save.hasAttribute("disabled")).toBe(true);
  const dialog = screen.getByRole("dialog", { name: "Editar referencia" });
  await user.click(
    within(dialog).getByLabelText(/Antes de publicar, asegúrate/),
  );
  expect(save.hasAttribute("disabled")).toBe(false);
});
