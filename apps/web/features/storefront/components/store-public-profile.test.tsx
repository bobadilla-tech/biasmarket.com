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
    screen.getByRole("navigation", { name: "Redes sociales de la tienda" })
      .className,
  ).toContain("col-start-2 row-start-1");
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
  renderProfile({ publicOwnerName: "Luna", publicOwnerAvatarUrl: null });

  expect(
    screen.getByRole("complementary", { name: "Dueño de la tienda" }),
  ).toBeTruthy();
  expect(screen.getByText("Luna")).toBeTruthy();
  expect(
    screen.getByRole("img", { name: "Foto del dueño de la tienda" }),
  ).toBeTruthy();
  const contact = screen.getByRole("link", { name: "Contactar" });
  const contactUrl = contact.getAttribute("href") ?? "";
  expect(contactUrl).toContain("https://wa.me/51999123456");
  expect(decodeURIComponent(contactUrl)).toContain(
    "Hola, tengo una consulta sobre la tienda Luna Shop.",
  );
  expect(contact.getAttribute("target")).toBe("_blank");
});

test("keeps the public owner block but hides contact when WhatsApp is missing", () => {
  usePublicStore.mockReturnValue({ data: { whatsappNumber: null } });
  renderProfile({ publicOwnerName: "Luna" });

  expect(
    screen.getByRole("complementary", { name: "Dueño de la tienda" }),
  ).toBeTruthy();
  expect(screen.queryByRole("link", { name: "Contactar" })).toBeNull();
});
