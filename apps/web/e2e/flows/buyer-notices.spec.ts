import { expect, test } from "@playwright/test";
import { newBuyerContext, openBuyerPage } from "./helpers/assisted-order";
import { WEB_URL } from "./helpers/env";
import { uniquePhone } from "./helpers/phones";
import {
  createAssistedOrder,
  createShop,
  recordPayment,
  sellerApi,
} from "./helpers/seller-api";

// G1: after a status change the seller is offered "Avisar al comprador" (in
// memory only; the raw link exists nowhere after the created screen). Sending
// it only logs BUYER_NOTIFIED: the buyer's link must be exactly as valid as
// before, with no regeneration. (The API e2e asserts the token hash itself.)
test("the seller is offered a notice after advancing, sending it logs it, and the buyer's old link still works", async ({
  page,
  browser,
}) => {
  const api = await sellerApi();
  const shop = await createShop(api);
  const order = await createAssistedOrder(api, shop, uniquePhone().e164);
  await recordPayment(api, shop, order.id, shop.price);
  await page.context().grantPermissions(["clipboard-read", "clipboard-write"], {
    origin: WEB_URL,
  });

  await page.goto(`/es/dashboard/${shop.slug}/orders`);
  const advanced = page.waitForResponse(
    (res) =>
      /\/fulfillment$/.test(res.url()) && res.request().method() === "PATCH",
    { timeout: 30_000 },
  );
  await page
    .getByRole("row")
    .filter({
      has: page.getByRole("button", { name: new RegExp(order.number) }),
    })
    .getByRole("button", { name: "Marcar En camino" })
    .click();
  expect((await advanced).ok()).toBe(true);

  const offer = page.getByRole("complementary", {
    name: "Avisar al comprador",
  });
  await expect(offer).toBeVisible();
  await expect(offer.getByText("El pedido va en camino.")).toBeVisible();
  await expect(
    offer.getByRole("textbox", { name: "Mensaje para el comprador" }),
  ).toHaveValue(new RegExp(`#${order.number}`));

  const logged = page.waitForResponse(
    (res) =>
      /\/buyer-notices$/.test(res.url()) && res.request().method() === "POST",
  );
  await offer.getByRole("button", { name: "Copiar mensaje" }).click();
  expect((await logged).status()).toBe(204);

  // The link the buyer already has is untouched, on a clean device.
  const ctx = await newBuyerContext(browser);
  await openBuyerPage(await ctx.newPage(), order.link, order.number);
  await ctx.close();
  await api.dispose();
});
