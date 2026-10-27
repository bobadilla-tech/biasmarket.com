import { render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { expect, test } from "vitest";
import { getMessages } from "@biasmarket/i18n";
import { StorePublicProfile } from "./storefront";

function renderProfile(
  props: Partial<Parameters<typeof StorePublicProfile>[0]> = {},
) {
  return render(
    <NextIntlClientProvider locale="es" messages={getMessages("es")}>
      <StorePublicProfile storeName="Luna Shop" {...props} />
    </NextIntlClientProvider>,
  );
}

test("renders a gray banner and logo placeholder when both images are absent", () => {
  renderProfile();
  expect(
    screen.getByRole("img", { name: "Banner de la tienda Luna Shop" }),
  ).toBeTruthy();
  expect(
    screen.getByRole("img", { name: "Logo de Luna Shop no configurado" }),
  ).toBeTruthy();
  expect(
    screen.getByRole("heading", { level: 1, name: "Luna Shop" }),
  ).toBeTruthy();
});

test("shows only configured public links and labels them for assistive technology", () => {
  renderProfile({
    instagramUrl: "https://instagram.com/luna",
    whatsappNumber: "+51 999 123 456",
  });

  const instagram = screen.getByRole("link", {
    name: "Instagram (se abre en una pestaña nueva)",
  });
  const whatsapp = screen.getByRole("link", {
    name: "WhatsApp (se abre en una pestaña nueva)",
  });
  expect(instagram.getAttribute("href")).toBe("https://instagram.com/luna");
  expect(whatsapp.getAttribute("href")).toBe("https://wa.me/51999123456");
  expect(instagram.getAttribute("target")).toBe("_blank");
  expect(instagram.getAttribute("rel")).toBe("noopener noreferrer");
  expect(
    screen.queryByRole("link", { name: /TikTok|Facebook|^X / }),
  ).toBeNull();
});

test("hides the location line when it is not configured", () => {
  renderProfile({ locationLabel: "   " });
  expect(screen.queryByText("   ")).toBeNull();
});
