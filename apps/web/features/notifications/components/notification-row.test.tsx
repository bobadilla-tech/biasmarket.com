import { afterEach, expect, test, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { getMessages } from "@biasmarket/i18n";
import type { NotificationResponseDto } from "@biasmarket/types";
import { NotificationRow } from "./notification-row";

afterEach(cleanup);

const item = (type: string): NotificationResponseDto =>
  ({
    id: "n1",
    type,
    title: "Título",
    body: "Cuerpo",
    read: true,
    createdAt: "2026-10-01T10:00:00.000Z",
  }) as unknown as NotificationResponseDto;

function renderRow(type: string) {
  return render(
    <NextIntlClientProvider locale="es" messages={getMessages("es")}>
      <NotificationRow item={item(type)} onMarkRead={vi.fn()} />
    </NextIntlClientProvider>,
  );
}

test("shows the translated label for a known type", () => {
  renderRow("RECEIPT_CONFIRMED");
  expect(screen.getByText("Recepción confirmada")).toBeTruthy();
});

test("falls back to a generic label for a type with no translation instead of throwing", () => {
  renderRow("SOMETHING_NEW");
  expect(screen.getByText("Notificación")).toBeTruthy();
});
