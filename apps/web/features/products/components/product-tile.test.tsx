import type { ReactNode } from "react";
import { expect, test, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
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

function contrastRatio(foreground: string, background: string) {
  const luminance = (hex: string) => {
    const [red, green, blue] = hex
      .slice(1)
      .match(/.{2}/g)!
      .map((channel) => parseInt(channel, 16) / 255)
      .map((channel) =>
        channel <= 0.04045
          ? channel / 12.92
          : ((channel + 0.055) / 1.055) ** 2.4,
      );

    return 0.2126 * red! + 0.7152 * green! + 0.0722 * blue!;
  };
  const foregroundLuminance = luminance(foreground);
  const backgroundLuminance = luminance(background);

  return (
    (Math.max(foregroundLuminance, backgroundLuminance) + 0.05) /
    (Math.min(foregroundLuminance, backgroundLuminance) + 0.05)
  );
}

function Wrapper({ children }: { children: ReactNode }) {
  return (
    <NextIntlClientProvider locale="es" messages={getMessages("es")}>
      {children}
    </NextIntlClientProvider>
  );
}

function renderTile(
  overrides: {
    status?: "PUBLISHED" | "DRAFT";
    name?: string;
    description?: string;
  } = {},
) {
  const onOpen = vi.fn();
  const onEdit = vi.fn();
  const onDelete = vi.fn();
  const onPublish = vi.fn();
  const tileProduct = {
    ...product,
    status: overrides.status ?? product.status,
    name: overrides.name ?? product.name,
    description: overrides.description ?? product.description,
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
  await user.keyboard("{ArrowDown}");
  expect(trigger.getAttribute("aria-expanded")).toBe("true");
  const menu = document.querySelector('[data-slot="menu-content"]');
  expect(menu).not.toBeNull();
  await user.click(within(menu as HTMLElement).getByText("Editar"));
  expect(onEdit).toHaveBeenCalledOnce();
  expect(onOpen).not.toHaveBeenCalled();

  await user.click(
    screen.getByRole("button", { name: "Acciones de Photocard set" }),
  );
  await user.keyboard("{ArrowDown}");
  const reopenedMenu = document.querySelector('[data-slot="menu-content"]');
  expect(reopenedMenu).not.toBeNull();
  await user.click(within(reopenedMenu as HTMLElement).getByText("Eliminar"));
  expect(onDelete).toHaveBeenCalledOnce();
  expect(onOpen).not.toHaveBeenCalled();
});

test("draft products keep the publish action", () => {
  const { onPublish } = renderTile({ status: "DRAFT" });
  expect(
    screen.getAllByRole("button", { name: "Publicar" }).length,
  ).toBeGreaterThan(0);
  expect(onPublish).not.toHaveBeenCalled();
});

test("mobile card content stays compact and readable with long copy", () => {
  const name = "Photocard set with a deliberately long product title";
  const description =
    "A deliberately long description that must not push the price and stock out of view";
  renderTile({ name, description });

  expect(screen.getByText(name).className).toContain("line-clamp-2");
  expect(screen.getByText(description).className).toContain("line-clamp-2");
  expect(screen.getByText("3 unidades").className).toContain("text-[#8a4b00]");
  expect(screen.getByText("Publicado").className).toContain("text-[#176b45]");
  expect(screen.getByText("TXT").className).toContain("text-[#39204f]");
  expect(
    screen.getByRole("button", {
      name: "Acciones de Photocard set with a deliberately long product title",
    }).className,
  ).toContain("size-11");

  for (const color of [
    "#2d1649",
    "#665776",
    "#b4234d",
    "#8a4b00",
    "#176b45",
    "#39204f",
  ]) {
    expect(contrastRatio(color, "#ffffff")).toBeGreaterThanOrEqual(4.5);
  }
});
