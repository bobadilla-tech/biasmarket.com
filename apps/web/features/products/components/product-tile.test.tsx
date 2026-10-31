import type { ReactNode } from "react";
import { expect, test, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NextIntlClientProvider } from "next-intl";
import { getMessages } from "@biasmarket/i18n";
import type { ProductDetailResponseDto } from "@biasmarket/types";
import { ProductTile } from "./product-tile";

const product = {
  id: "product-1",
  name: "Photocard set",
  description: "A very long product description used to verify compact cards.",
  currency: "PEN",
  price: "25.00",
  availableStock: 3,
  soldOut: false,
  discontinued: false,
  status: "PUBLISHED",
  images: [],
} as unknown as ProductDetailResponseDto;

function Wrapper({ children }: { children: ReactNode }) {
  return (
    <NextIntlClientProvider locale="es" messages={getMessages("es")}>
      {children}
    </NextIntlClientProvider>
  );
}

function renderTile(overrides: { status?: "PUBLISHED" | "DRAFT" } = {}) {
  const onOpen = vi.fn();
  const onEdit = vi.fn();
  const onDelete = vi.fn();
  const onPublish = vi.fn();
  const tileProduct = {
    ...product,
    status: overrides.status ?? product.status,
  } as ProductDetailResponseDto;

  render(
    <ProductTile
      product={tileProduct}
      category="TXT"
      stockLabel="3 unidades"
      stockClassName="text-[#d97706]"
      editLabel="Editar"
      deleteLabel="Eliminar"
      publishLabel="Publicar"
      statusDraftLabel="Borrador"
      statusPublishedLabel="Publicado"
      onOpen={onOpen}
      onEdit={onEdit}
      onDelete={onDelete}
      onPublish={onPublish}
    />,
    { wrapper: Wrapper },
  );

  return { onOpen, onEdit, onDelete, onPublish };
}

test("mobile actions are accessible and do not open the product detail", async () => {
  const user = userEvent.setup();
  const { onOpen, onEdit, onDelete } = renderTile();
  const trigger = screen.getByRole("button", {
    name: "Acciones de Photocard set",
  });

  expect(trigger.className).toContain("size-11");
  await user.click(trigger);
  await user.click(screen.getByRole("menuitem", { name: "Editar" }));
  expect(onEdit).toHaveBeenCalledOnce();
  expect(onOpen).not.toHaveBeenCalled();

  await user.click(
    screen.getByRole("button", { name: "Acciones de Photocard set" }),
  );
  await user.click(screen.getByRole("menuitem", { name: "Eliminar" }));
  expect(onDelete).toHaveBeenCalledOnce();
  expect(onOpen).not.toHaveBeenCalled();
});

test("draft products keep the publish action", () => {
  const { onPublish } = renderTile({ status: "DRAFT" });
  expect(screen.getByRole("button", { name: "Publicar" })).toBeDefined();
  expect(onPublish).not.toHaveBeenCalled();
});
