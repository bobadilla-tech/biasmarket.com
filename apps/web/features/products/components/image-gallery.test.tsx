import type { ReactNode } from "react";
import { expect, test } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NextIntlClientProvider } from "next-intl";
import { getMessages } from "@biasmarket/i18n";
import { ImageGallery } from "./image-gallery";

// A `wrapper`-based render so `rerender` re-applies the intl provider (the
// shared renderWithProviders inlines its providers and drops them on
// rerender). ImageGallery needs no QueryClient.
function Wrapper({ children }: { children: ReactNode }) {
  return (
    <NextIntlClientProvider locale="es" messages={getMessages("es")}>
      {children}
    </NextIntlClientProvider>
  );
}

function renderGallery(ui: ReactNode) {
  return render(ui, { wrapper: Wrapper });
}

// Behavior pins (clamp / reset / wrap / thumb-click) carried over from PR A,
// plus the #135 fix-companion assertions: theme-var active border,
// aria-current on the active thumb, accessible arrow names, internal dedupe.
// ImageGallery now calls useTranslations, so it renders through the intl
// provider.

const IMAGES = [
  "https://cdn.biasmarket.com/a.jpg",
  "https://cdn.biasmarket.com/b.jpg",
  "https://cdn.biasmarket.com/c.jpg",
];

// Thumbnails contain an <img>; the nav arrows contain an <svg>.
function thumbs() {
  return screen
    .getAllByRole("button")
    .filter((b) => b.querySelector("img") !== null);
}

function activeThumbIndex() {
  return thumbs().findIndex((b) => b.getAttribute("aria-current") === "true");
}

test("clicking a thumbnail makes it the active image", async () => {
  const user = userEvent.setup();
  renderGallery(<ImageGallery images={IMAGES} alt="Tee" />);

  expect(activeThumbIndex()).toBe(0);

  await user.click(thumbs()[2]);
  expect(activeThumbIndex()).toBe(2);

  expect(
    (screen.getByAltText("Tee") as HTMLImageElement).getAttribute("src"),
  ).toContain(encodeURIComponent(IMAGES[2]));
});

test("exactly one thumb is aria-current, and it carries the theme-var border", async () => {
  const user = userEvent.setup();
  renderGallery(<ImageGallery images={IMAGES} alt="Tee" />);

  const current = thumbs().filter(
    (b) => b.getAttribute("aria-current") === "true",
  );
  expect(current).toHaveLength(1);
  expect(current[0].className).toContain("border-[var(--store-primary)]");

  await user.click(thumbs()[1]);
  expect(
    thumbs().filter((b) => b.getAttribute("aria-current") === "true"),
  ).toHaveLength(1);
  expect(thumbs()[1].className).toContain("border-[var(--store-primary)]");
  expect(thumbs()[0].getAttribute("aria-current")).toBeNull();
});

test("the nav arrows have accessible names", () => {
  renderGallery(<ImageGallery images={IMAGES} alt="Tee" />);

  expect(screen.getByRole("button", { name: "Imagen anterior" })).toBeDefined();
  expect(
    screen.getByRole("button", { name: "Imagen siguiente" }),
  ).toBeDefined();
});

test("the previous / next arrows wrap at both ends", async () => {
  const user = userEvent.setup();
  renderGallery(<ImageGallery images={IMAGES} alt="Tee" />);

  await user.click(screen.getByRole("button", { name: "Imagen anterior" }));
  expect(activeThumbIndex()).toBe(IMAGES.length - 1);

  await user.click(screen.getByRole("button", { name: "Imagen siguiente" }));
  expect(activeThumbIndex()).toBe(0);
});

test("a repeated URL collapses to a single thumbnail", () => {
  renderGallery(
    <ImageGallery images={[IMAGES[0], IMAGES[0], IMAGES[1]]} alt="Tee" />,
  );

  expect(thumbs()).toHaveLength(2);
});

test("shrinking the image list clamps the main image instead of blanking it", async () => {
  const user = userEvent.setup();
  const { rerender } = renderGallery(
    <ImageGallery images={IMAGES} alt="Tee" />,
  );

  await user.click(thumbs()[2]);
  expect(activeThumbIndex()).toBe(2);

  rerender(<ImageGallery images={IMAGES.slice(0, 2)} alt="Tee" />);

  expect(screen.getByAltText("Tee")).toBeDefined();
  expect(activeThumbIndex()).toBe(0);
});

test("changing the image set resets the active image to the first", async () => {
  const user = userEvent.setup();
  const { rerender } = renderGallery(
    <ImageGallery images={IMAGES} alt="Tee" />,
  );

  await user.click(thumbs()[2]);
  expect(activeThumbIndex()).toBe(2);

  rerender(
    <ImageGallery
      images={[
        "https://cdn.biasmarket.com/x.jpg",
        "https://cdn.biasmarket.com/y.jpg",
      ]}
      alt="Tee"
    />,
  );

  expect(activeThumbIndex()).toBe(0);
});

test("a single image renders no nav arrows and no thumbnail strip", () => {
  renderGallery(<ImageGallery images={[IMAGES[0]]} alt="Tee" />);
  expect(screen.queryAllByRole("button")).toHaveLength(0);
});

test("an empty image list renders a placeholder, no image", () => {
  renderGallery(<ImageGallery images={[]} alt="Tee" />);
  expect(screen.queryByAltText("Tee")).toBeNull();
  expect(screen.queryAllByRole("button")).toHaveLength(0);
});
