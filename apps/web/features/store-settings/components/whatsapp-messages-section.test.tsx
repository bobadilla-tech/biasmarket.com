import { afterEach, expect, test, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { getMessages } from "@biasmarket/i18n";
import { whatsappTemplatesKeys } from "../queries/use-whatsapp-templates";

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
};

function renderSection(queryClient: QueryClient) {
  return render(
    <NextIntlClientProvider locale="es" messages={getMessages("es")}>
      <QueryClientProvider client={queryClient}>
        <WhatsAppMessagesSection
          storeId="store-1"
          templates={templates}
          loading={false}
        />
      </QueryClientProvider>
    </NextIntlClientProvider>,
  );
}

test("renders the assisted-order editor with its literal token description and a live preview", () => {
  renderSection(new QueryClient());

  expect(
    screen.getByText("Mensaje de enlace de pedido asistido"),
  ).toBeDefined();
  // ICU-quoted in the catalog: the braces render literally.
  expect(screen.getByText(/el enlace \(\{\{link\}\}\)/)).toBeDefined();
  const editor = screen.getByLabelText("Mensaje de enlace de pedido asistido");
  fireEvent.change(editor, { target: { value: "Hola {{name}} {{link}}" } });
  expect(
    screen.getAllByText(/https:\/\/biasmarket\.com\/es\/store\/k-store/).length,
  ).toBeGreaterThan(0);
});

test("saving the assisted-order template writes only that key into the templates cache", async () => {
  const queryClient = new QueryClient();
  const key = whatsappTemplatesKeys.byStore("store-1");
  queryClient.setQueryData(key, {
    newOrder: { template: "keep" },
    paymentReminder: null,
    assistedOrderLink: null,
  });
  const saved = { type: "ASSISTED_ORDER_LINK", template: "Hola {{link}}" };
  upsert.mockResolvedValue(saved);
  renderSection(queryClient);

  fireEvent.change(
    screen.getByLabelText("Mensaje de enlace de pedido asistido"),
    { target: { value: "Hola {{link}}" } },
  );
  const saveButtons = screen.getAllByRole("button", { name: /^Guardar/ });
  fireEvent.click(saveButtons[2]!);

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
    }),
  );
});
