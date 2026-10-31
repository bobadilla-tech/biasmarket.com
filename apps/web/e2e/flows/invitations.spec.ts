import { expect, test, type Page } from "@playwright/test";
import { newBuyerContext, openBuyerPage } from "./helpers/assisted-order";
import { cookieNamed, stubGoogle, uniqueGoogleCode } from "./helpers/google";
import { uniquePhone } from "./helpers/phones";
import {
  advanceFulfillment,
  createAssistedOrder,
  createShop,
  recordPayment,
  sellerApi,
} from "./helpers/seller-api";

// "Guarda este pedido en tu cuenta" invitations (#277). The rules live in
// features/public-order/lib/invite-rules.ts (unit-tested); these specs prove
// what a buyer actually sees. Every absence assertion comes after the order
// itself and a positive control are on screen: the invite is computed in an
// effect after hydration, so an early `toHaveCount(0)` would pass for free.

const DAY = 24 * 60 * 60 * 1000;
const inviteKey = (slug: string, number: string, name: string) =>
  `bm-invite:${slug}:${number}:${name}`;
const validatedBlock = (page: Page) =>
  page.getByRole("heading", { name: "Tu pago está validado" });
const save = (page: Page) =>
  page.getByRole("button", { name: "Guardar con Google" });
const teaser = (page: Page) =>
  page.getByText("Guarda tu pedido para ver el historial completo con fechas.");

test("no invitation before the payment is validated; it appears after, and 'Ahora no' keeps it away across reloads", async ({
  browser,
}) => {
  const api = await sellerApi();
  const shop = await createShop(api);
  const order = await createAssistedOrder(api, shop, uniquePhone().e164);
  const ctx = await newBuyerContext(browser);
  const buyer = await ctx.newPage();

  // Unpaid: the order and the upload form are there, the invitation is not.
  await openBuyerPage(buyer, order.link, order.number);
  await expect(buyer.getByText("Sube tu comprobante")).toBeVisible();
  await expect(validatedBlock(buyer)).toHaveCount(0);
  await expect(save(buyer)).toHaveCount(0);

  // Validated (the seller records the full payment): positive control.
  await recordPayment(api, shop, order.id, shop.price);
  await buyer.reload();
  await expect(validatedBlock(buyer)).toBeVisible();
  await expect(save(buyer)).toBeEnabled();

  // "Ahora no" writes the key and the block stays gone after a reload; the
  // quiet teaser takes its place in the history section.
  await buyer.getByRole("button", { name: "Ahora no" }).click();
  await expect(validatedBlock(buyer)).toHaveCount(0);
  const stored = await buyer.evaluate(
    (key) => window.localStorage.getItem(key),
    inviteKey(shop.slug, order.number, "dismissedAt"),
  );
  expect(Number(stored)).toBeGreaterThan(Date.now() - 60_000);
  await buyer.reload();
  await expect(
    buyer.getByText(`Pedido #${order.number}`).first(),
  ).toBeVisible();
  await expect(teaser(buyer)).toBeVisible();
  await expect(validatedBlock(buyer)).toHaveCount(0);

  await ctx.close();
  await api.dispose();
});

test("a dismissal younger than 7 days keeps it quiet; older than 7 days brings back the banner", async ({
  browser,
}) => {
  const api = await sellerApi();
  const shop = await createShop(api);
  const order = await createAssistedOrder(api, shop, uniquePhone().e164);
  await recordPayment(api, shop, order.id, shop.price);

  // 6 days ago: still dismissed. Not "nothing": the history teaser shows.
  const recent = await newBuyerContext(browser);
  await recent.addInitScript(
    ([key, at]) => {
      if (!window.localStorage.getItem(key))
        window.localStorage.setItem(key, at);
    },
    [
      inviteKey(shop.slug, order.number, "dismissedAt"),
      String(Date.now() - 6 * DAY),
    ] as const,
  );
  const recentPage = await recent.newPage();
  await openBuyerPage(recentPage, order.link, order.number);
  await expect(teaser(recentPage)).toBeVisible();
  await expect(validatedBlock(recentPage)).toHaveCount(0);
  await expect(
    recentPage.getByText("Guarda este pedido en tu cuenta"),
  ).toHaveCount(0);
  await recent.close();

  // 8 days ago, and the first-validation block was already seen: the banner.
  const old = await newBuyerContext(browser);
  await old.addInitScript(
    ([dismissed, firstSeen, at]) => {
      if (!window.localStorage.getItem(dismissed)) {
        window.localStorage.setItem(dismissed, at);
        window.localStorage.setItem(firstSeen, "1");
      }
    },
    [
      inviteKey(shop.slug, order.number, "dismissedAt"),
      inviteKey(shop.slug, order.number, "firstSeen"),
      String(Date.now() - 8 * DAY),
    ] as const,
  );
  const oldPage = await old.newPage();
  await openBuyerPage(oldPage, order.link, order.number);
  const banner = oldPage.getByText("Guarda este pedido en tu cuenta");
  await expect(banner).toBeVisible();
  // The banner is a collapsed <details>: open it to reach the button.
  await banner.click();
  await expect(save(oldPage)).toBeVisible();
  await old.close();
  await api.dispose();
});

test("after the buyer confirms receipt the delivery invitation shows", async ({
  browser,
}) => {
  const api = await sellerApi();
  const shop = await createShop(api);
  const order = await createAssistedOrder(api, shop, uniquePhone().e164);
  await recordPayment(api, shop, order.id, shop.price);
  await advanceFulfillment(api, shop, order.id, "IN_TRANSIT");

  const ctx = await newBuyerContext(browser);
  const buyer = await ctx.newPage();
  await openBuyerPage(buyer, order.link, order.number);
  // Before receipt: the payment-validated block, not the delivery one.
  await expect(validatedBlock(buyer)).toBeVisible();
  await expect(
    buyer.getByRole("heading", { name: "Guarda tu historial" }),
  ).toHaveCount(0);

  await buyer.getByRole("button", { name: "Ya lo recibí" }).click();
  await expect(buyer.getByText("¡Gracias por confirmar!")).toBeVisible();
  await expect(
    buyer.getByRole("heading", { name: "Guarda tu historial" }),
  ).toBeVisible();
  // One invitation at a time: the delivery block replaced the other.
  await expect(validatedBlock(buyer)).toHaveCount(0);
  await expect(save(buyer)).toHaveCount(1);
  await ctx.close();
  await api.dispose();
});

test("a claimed order is never invited again", async ({ browser }) => {
  const api = await sellerApi();
  const shop = await createShop(api);
  const order = await createAssistedOrder(api, shop, uniquePhone().e164);
  await recordPayment(api, shop, order.id, shop.price);

  const ctx = await newBuyerContext(browser);
  const buyer = await ctx.newPage();
  await openBuyerPage(buyer, order.link, order.number);
  await expect(validatedBlock(buyer)).toBeVisible();

  // The only claim of this spec file (claim endpoints are 10/min per IP).
  await expect(save(buyer)).toBeEnabled();
  await stubGoogle(buyer, uniqueGoogleCode());
  await save(buyer).click();
  await buyer.waitForURL(/\/my-purchases\/orders\/[^/?]+\?claimed=1/);
  expect(await cookieNamed(ctx, "bm_customer_session")).toBeTruthy();

  // Back on the private link: saved state, no invitation of any kind.
  await openBuyerPage(buyer, order.link, order.number);
  await expect(buyer.getByText("Pedido guardado en tu cuenta")).toBeVisible();
  await expect(validatedBlock(buyer)).toHaveCount(0);
  await expect(buyer.getByText("Guarda este pedido en tu cuenta")).toHaveCount(
    0,
  );
  await expect(teaser(buyer)).toHaveCount(0);
  await expect(save(buyer)).toHaveCount(0);
  await ctx.close();
  await api.dispose();
});

test("a failed claim lands on My purchases with the Spanish reason and starts no claim", async ({
  browser,
}) => {
  const ctx = await newBuyerContext(browser);
  const page = await ctx.newPage();
  const started: string[] = [];
  page.on("request", (req) => {
    const url = req.url();
    if (
      req.method() !== "GET" ||
      url.includes("/claim-ticket") ||
      url.includes("/api/account/google")
    ) {
      started.push(`${req.method()} ${url}`);
    }
  });
  await page.goto("/es/my-purchases?claim=already_claimed");
  await expect(
    page
      .getByRole("alert")
      .filter({ hasText: "Este pedido ya fue guardado en otra cuenta." }),
  ).toBeVisible();
  await page.waitForLoadState("networkidle");
  expect(started).toEqual([]);
  await ctx.close();
});
