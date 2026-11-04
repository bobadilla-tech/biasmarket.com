import { afterEach, expect, test, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { getMessages } from "@biasmarket/i18n";
import { whatsappTemplatesKeys } from "../queries/use-whatsapp-templates";
import { withSettingsDraftActions } from "../../../test-utils/settings-draft-test-actions";

const { upsert } = vi.hoisted(() => ({ upsert: vi.fn() }));

vi.mock("@/lib/api-client", () => ({
  apiClient: { whatsappTemplates: { findOne: vi.fn(), upsert } },
}));

const { WhatsAppMessagesSection } = await import("./whatsapp-messages-section");

afterEach(() => {
  vi.clearAllMocks();
});

const templates = {
  newOrder: null,
  paymentReminder: null,
  assistedOrderLink: null,
  orderCancelled: null,
  paymentValidated: null,
  inTransit: null,
  ready: null,
  delivered: null,
};

function renderSection(
  queryClient: QueryClient,
  sectionTemplates: Record<keyof typeof templates, string | null> = templates,
) {
  return render(
    <NextIntlClientProvider locale="es" messages={getMessages("es")}>
      <QueryClientProvider client={queryClient}>
        {withSettingsDraftActions(
          <WhatsAppMessagesSection
            storeId="store-1"
            templates={sectionTemplates}
            loading={false}
          />,
          "messages",
        )}
      </QueryClientProvider>
    </NextIntlClientProvider>,
  );
}

test("renders the assisted-order editor with its literal token description and a live preview", () => {
  renderSection(new QueryClient());

  fireEvent.click(screen.getByText("Mensaje de enlace de pedido asistido"));
  // ICU-quoted in the catalog: the braces render literally.
  expect(screen.getByText(/Variable requerida: \{\{link\}\}/)).toBeDefined();
  const editor = screen.getByLabelText("Mensaje de enlace de pedido asistido");
  fireEvent.change(editor, { target: { value: "Hola {{name}} {{link}}" } });
  expect(
    screen.getAllByText(/https:\/\/biasmarket\.com\/es\/store\/k-store/).length,
  ).toBeGreaterThan(0);
});

test("edits and saves the order-cancellation message under Orders", async () => {
  const queryClient = new QueryClient();
  upsert.mockResolvedValue({
    type: "ORDER_CANCELLED",
    template: "Pedido {{orderRef}} cancelado.",
  });
  renderSection(queryClient);

  fireEvent.click(screen.getByText("Aviso de pedido cancelado"));
  fireEvent.change(screen.getByLabelText("Aviso de pedido cancelado"), {
    target: { value: "Pedido {{orderRef}} cancelado." },
  });
  fireEvent.click(screen.getByRole("button", { name: "Save tab" }));

  await waitFor(() =>
    expect(upsert).toHaveBeenCalledWith("store-1", "ORDER_CANCELLED", {
      template: "Pedido {{orderRef}} cancelado.",
    }),
  );
});

test("saving the assisted-order template writes only that key into the templates cache", async () => {
  const queryClient = new QueryClient();
  const key = whatsappTemplatesKeys.byStore("store-1");
  queryClient.setQueryData(key, {
    newOrder: { template: "keep" },
    paymentReminder: null,
    assistedOrderLink: null,
    orderCancelled: null,
  });
  const saved = { type: "ASSISTED_ORDER_LINK", template: "Hola {{link}}" };
  upsert.mockResolvedValue(saved);
  renderSection(queryClient);

  fireEvent.click(screen.getByText("Mensaje de enlace de pedido asistido"));
  fireEvent.change(
    screen.getByLabelText("Mensaje de enlace de pedido asistido"),
    { target: { value: "Hola {{link}}" } },
  );
  fireEvent.click(screen.getByRole("button", { name: "Save tab" }));

  await waitFor(() =>
    expect(upsert).toHaveBeenCalledWith("store-1", "ASSISTED_ORDER_LINK", {
      template: "Hola {{link}}",
    }),
  );
  await waitFor(() =>
    expect(queryClient.getQueryData(key)).toEqual({
      newOrder: { template: "keep" },
      paymentReminder: null,
      assistedOrderLink: saved,
      orderCancelled: null,
    }),
  );
});

test("restoring the assisted-order default saves an empty override", async () => {
  upsert.mockResolvedValue({ type: "ASSISTED_ORDER_LINK", template: null });
  renderSection(new QueryClient(), {
    ...templates,
    assistedOrderLink: "Custom {{link}}",
  });

  fireEvent.click(screen.getByText("Mensaje de enlace de pedido asistido"));
  fireEvent.click(
    screen.getByRole("button", { name: "Restaurar predeterminado" }),
  );
  fireEvent.click(screen.getByRole("button", { name: "Save tab" }));

  await waitFor(() =>
    expect(upsert).toHaveBeenCalledWith("store-1", "ASSISTED_ORDER_LINK", {
      template: "",
    }),
  );
});

test("renders one editor per buyer notice, with a live preview that has no link", () => {
  renderSection(new QueryClient());

  const titles = [
    "Aviso al comprador: pago validado",
    "Aviso al comprador: pedido en camino",
    "Aviso al comprador: pedido listo",
    "Aviso al comprador: pedido entregado",
  ];
  for (const title of titles) {
    fireEvent.click(screen.getByText(title));
    expect(screen.getByLabelText(title)).toBeDefined();
  }

  fireEvent.click(screen.getByText("Aviso al comprador: pedido en camino"));
  const editor = screen.getByLabelText("Aviso al comprador: pedido en camino");
  fireEvent.change(editor, {
    target: { value: "Va en camino {{orderRef}} {{trackingNumber}}" },
  });
  expect(screen.getByText("Va en camino #123456 OLV-123456")).toBeDefined();
});
