import { render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { expect, test, vi } from "vitest";
import { getMessages } from "@biasmarket/i18n";

const { usePublicStore } = vi.hoisted(() => ({ usePublicStore: vi.fn() }));
vi.mock("@/features/customer-auth/queries/use-public-store", () => ({
  usePublicStore: (...args: unknown[]) => usePublicStore(...args),
}));

const { StorePublicProfile } = await import("./storefront");

function renderProfile(
  props: Partial<Parameters<typeof StorePublicProfile>[0]> = {},
) {
  return render(
    <NextIntlClientProvider locale="es" messages={getMessages("es")}>
      <StorePublicProfile storeName="Luna Shop" slug="luna" {...props} />
    </NextIntlClientProvider>,
  );
}

test("renders the branded banner and logo placeholder when images are absent", () => {
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
  expect(
    screen.getByRole("heading", { level: 1, name: "Luna Shop" }).className,
  ).toContain("line-clamp-2");
  expect(screen.getByText("SELECCIÓN CUIDADA · BIAS MARKET")).toBeTruthy();
  expect(
    screen.getByRole("img", { name: "Logo de Luna Shop no configurado" })
      .className,
  ).toContain("bg-(--store-primary)");
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
    screen.getByRole("navigation", { name: "Redes sociales de la tienda" })
      .className,
  ).toContain("row-start-2");
  expect(
    screen.getByRole("navigation", { name: "Redes sociales de la tienda" })
      .className,
  ).toContain("sm:col-start-2 sm:row-start-1 sm:justify-self-end");
  expect(
    screen.queryByRole("link", { name: /TikTok|Facebook|^X / }),
  ).toBeNull();
});

test("hides the location line when it is blank", () => {
  renderProfile({ locationLabel: "   " });
  expect(screen.queryByRole("img", { name: "Ubicación" })).toBeNull();
  expect(screen.queryByText("   ")).toBeNull();
});

test("does not render an owner block when public owner name is missing", () => {
  renderProfile({ publicOwnerAvatarUrl: "https://cdn.example.com/avatar.png" });
  expect(
    screen.queryByRole("complementary", { name: "Dueño de la tienda" }),
  ).toBeNull();
  expect(screen.queryByRole("link", { name: "Contactar" })).toBeNull();
});

test("renders the public owner and reuses the WhatsApp contact button", () => {
  usePublicStore.mockReturnValue({
    data: { whatsappNumber: "+51 999 123 456" },
  });
  renderProfile({
    publicOwnerName: "Luna",
    publicOwnerAvatarUrl: null,
    instagramUrl: "https://instagram.com/luna",
  });

  const owner = screen.getByRole("complementary", {
    name: "Dueño de la tienda",
  });
  expect(owner.className).toContain("col-start-2 row-start-1");
  expect(screen.getByText("Luna")).toBeTruthy();
  expect(
    screen.getByRole("img", { name: "Foto del dueño de la tienda" }),
  ).toBeTruthy();
  const contact = screen.getByRole("link", { name: "Contactar" });
  expect(contact.className).toContain("whitespace-nowrap");
  expect(contact.className).toContain("min-h-11");
  expect(contact.querySelector("svg")?.getAttribute("class")).toContain(
    "lucide-mail",
  );
  const contactUrl = contact.getAttribute("href") ?? "";
  expect(contactUrl).toContain("https://wa.me/51999123456");
  expect(decodeURIComponent(contactUrl)).toContain(
    "Hola, tengo una consulta sobre la tienda Luna Shop.",
  );
  expect(contact.getAttribute("target")).toBe("_blank");
  const socialLinks = screen.getByRole("navigation", {
    name: "Redes sociales de la tienda",
  });
  expect(socialLinks.className).toContain("col-span-2 row-start-2");
  expect(socialLinks.className).toContain("sm:col-span-1 sm:col-start-1");
});

test("keeps the public owner block but hides contact when WhatsApp is missing", () => {
  usePublicStore.mockReturnValue({ data: { whatsappNumber: null } });
  renderProfile({ publicOwnerName: "Luna" });

  expect(
    screen.getByRole("complementary", { name: "Dueño de la tienda" }),
  ).toBeTruthy();
  expect(screen.queryByRole("link", { name: "Contactar" })).toBeNull();
});
