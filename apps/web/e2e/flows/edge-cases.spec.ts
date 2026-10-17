import { expect, test } from "@playwright/test";
import {
  createOrderViaUi,
  newBuyerContext,
  openBuyerPage,
} from "./helpers/assisted-order";
import { SEED_SELLER } from "./helpers/env";
import { uniquePhone } from "./helpers/phones";
import { createShop, sellerApi } from "./helpers/seller-api";

test("an invalid phone shows the Spanish error summary and creates nothing", async ({
  page,
}) => {
  const api = await sellerApi();
  const shop = await createShop(api);

  await page.goto(`/es/dashboard/${shop.slug}/orders/new`);
  await page.locator("#assisted-phone").fill("123");
  await page
    .locator("#assisted-item-0-product")
    .selectOption({ label: shop.productName });
  await page.getByRole("button", { name: "Crear pedido" }).click();

  const summary = page.locator("#assisted-order-error-summary");
  await expect(summary).toBeVisible();
  await expect(summary).toContainText("Revisa los campos marcados.");
  await expect(page.locator("#assisted-phone")).toHaveAttribute(
    "aria-invalid",
    "true",
  );
  await expect(
    page.getByRole("heading", { name: "Pedido creado" }),
  ).toHaveCount(0);
  await api.dispose();
});

test("a regenerated link replaces the old one: old shows not-valid in a fresh context, new works", async ({
  page,
  browser,
}) => {
  const api = await sellerApi();
  const shop = await createShop(api);
  const phone = uniquePhone();
  const order = await createOrderViaUi(page, shop, phone);

  // Positive control: the original link works before it is regenerated.
  const before = await newBuyerContext(browser);
  await openBuyerPage(await before.newPage(), order.link, order.number);
  await before.close();

  await page.goto(`/es/dashboard/${shop.slug}/orders?order=${order.id}`);
  await page
    .getByRole("button", { name: "Regenerar enlace", exact: true })
    .click();
  await page.getByRole("button", { name: "Sí, regenerar" }).click();
  const message = page.locator("#assisted-link-message");
  await expect(message).toBeVisible();
  const fresh = (await message.inputValue()).match(
    /https?:\/\/\S+\/pedido\/[\w-]+/,
  )?.[0];
  expect(fresh).toBeTruthy();
  expect(fresh).not.toBe(order.link);

  const oldCtx = await newBuyerContext(browser);
  const oldPage = await oldCtx.newPage();
  await oldPage.goto(order.link);
  await expect(oldPage.getByTestId("public-order-invalid")).toBeVisible();
  await expect(
    oldPage.getByText("Este enlace no es válido").first(),
  ).toBeVisible();

  const newCtx = await newBuyerContext(browser);
  await openBuyerPage(await newCtx.newPage(), fresh!, order.number);
  await oldCtx.close();
  await newCtx.close();
  await api.dispose();
});

test("an expired order renders as closed, with no way to pay (render only: the real expiry is in the API e2e)", async ({
  page,
  browser,
}) => {
  const api = await sellerApi();
  const shop = await createShop(api);
  const order = await createOrderViaUi(page, shop, uniquePhone());

  const ctx = await newBuyerContext(browser);
  const buyer = await ctx.newPage();
  // Real response, only the status fields mutated: what the API sends for a
  // swept order (status/paymentStatus CANCELLED, closure EXPIRED, no methods).
  await buyer.route(/\/api\/public\/orders\/[^/]+$/, async (route) => {
    const response = await route.fetch();
    const body = await response.json();
    await route.fulfill({
      response,
      json: {
        ...body,
        status: "CANCELLED",
        paymentStatus: "CANCELLED",
        paymentMethods: [],
        paymentInstructions: null,
        expiresAt: null,
        closure: { kind: "EXPIRED", reason: null },
      },
    });
  });
  await openBuyerPage(buyer, order.link, order.number);
  await expect(
    buyer.getByText("El tiempo para pagar este pedido terminó y se canceló."),
  ).toBeVisible();
  await expect(buyer.getByText("Sube tu comprobante")).toHaveCount(0);
  await ctx.close();
  await api.dispose();
});

test("tenant isolation: the seed seller cannot open another seller's dashboard", async ({
  page,
}) => {
  const orderRequests: string[] = [];
  page.on("request", (req) => {
    if (/\/api\/stores\/[^/]+\/orders/.test(req.url()))
      orderRequests.push(req.url());
  });
  // Positive marker: the API itself refuses the store (403), so the page can
  // never learn its id. Only then are the negative assertions meaningful.
  const refused = page.waitForResponse((res) =>
    res.url().endsWith(`/api/stores/by-slug/${SEED_SELLER.otherStoreSlug}`),
  );
  await page.goto(`/es/dashboard/${SEED_SELLER.otherStoreSlug}/orders`);
  expect((await refused).status()).toBe(403);
  await page.waitForLoadState("networkidle");
  expect(orderRequests).toEqual([]);
  await expect(page.getByRole("button", { name: "Nuevo pedido" })).toHaveCount(
    0,
  );
});
