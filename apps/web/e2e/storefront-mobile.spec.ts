import { expect, test } from "@playwright/test";

const STORE_URL = "/es/store/demo-kpop-corner";

test("mobile catalog fits supported widths and supports search, filtering, and cart", async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== "desktop", "run one responsive pass");
  for (const width of [360, 390, 430, 768, 1024]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto(`${STORE_URL}?tab=productos`, {
      waitUntil: "networkidle",
    });
    await expect(
      page.getByRole("heading", { level: 1, name: "K-Pop Corner" }),
    ).toBeVisible();

    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth > window.innerWidth + 1,
    );
    expect(overflow, `catalog should not overflow at ${width}px`).toBe(false);

    await page.getByRole("tab", { name: "Categorías" }).click();
    await expect(
      page.getByRole("heading", { name: "Categorías" }),
    ).toBeVisible();
    await page.getByRole("tab", { name: "Referencias" }).click();
    await expect(
      page.getByRole("heading", { name: "Referencias de K-Pop Corner" }),
    ).toBeVisible();
  }

  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`${STORE_URL}?tab=productos`, {
    waitUntil: "networkidle",
  });
  const compactHeader = page.getByTestId("storefront-compact-header");
  await expect(compactHeader).toHaveAttribute("aria-hidden", "true");
  await page.evaluate(() => window.scrollTo(0, 700));
  await expect(compactHeader).toHaveAttribute("aria-hidden", "false");
  await page.evaluate(() => window.scrollTo(0, 0));
  await expect(compactHeader).toHaveAttribute("aria-hidden", "true");

  await page.goto(`${STORE_URL}?tab=categorias`, {
    waitUntil: "networkidle",
  });
  await page.getByRole("link", { name: "Posters" }).click();
  await expect(page).toHaveURL(/tab=productos.*categoria=posters/);
  await expect(
    page.getByRole("heading", { name: "Poster Oficial" }),
  ).toBeVisible();

  await page.getByRole("textbox", { name: "Buscar productos" }).fill("poster");
  await expect(page).toHaveURL(/q=poster/);
  await page.getByRole("button", { name: "Agregar al carrito" }).click();
  await expect(
    page.getByRole("status").filter({ hasText: "1 producto" }),
  ).toBeVisible();
});
