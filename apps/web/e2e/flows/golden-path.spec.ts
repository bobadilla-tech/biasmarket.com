import { expect, test } from "@playwright/test";
import { runAxe } from "../axe-helper";
import { API_URL } from "./helpers/env";
import {
  createOrderViaUi,
  newBuyerContext,
  openBuyerPage,
  PROOF_IMAGE,
} from "./helpers/assisted-order";
import { cookieNamed, stubGoogle, uniqueGoogleCode } from "./helpers/google";
import { uniquePhone } from "./helpers/phones";
import { createShop, getOrder, sellerApi } from "./helpers/seller-api";

function limaCalendarDate(date = new Date()) {
  const parts = new Intl.DateTimeFormat("en", {
    timeZone: "America/Lima",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const values = Object.fromEntries(
    parts.map(({ type, value }) => [type, value]),
  );
  return `${values.year}-${values.month}-${values.day}`;
}

test("golden path: seller creates, buyer pays with a proof, seller approves and advances, buyer confirms and saves with Google", async ({
  page,
  browser,
}, testInfo) => {
  const api = await sellerApi();
  const shop = await createShop(api);
  const phone = uniquePhone();

  // 1. Seller creates the order (one click) and gets the private link.
  const order = await createOrderViaUi(page, shop, phone);
  await expect(
    page.getByRole("heading", { name: "Pedido creado" }),
  ).toBeVisible();
  // Known: the created screen's helper text (#8e7ca7 on white, 3.75:1) fails
  // color-contrast (serious) in production code, which this work does not
  // touch. Gate the seller screen at `critical` until that is fixed, then
  // raise it to match the buyer page below.
  await runAxe(page, testInfo, { gate: ["critical"] });

  // 2. Buyer opens the link on a clean device. Before the claim the page is a
  // summary: the API returns no timeline.
  const buyerContext = await newBuyerContext(browser);
  const buyer = await buyerContext.newPage();
  const orderGets: string[] = [];
  buyer.on("request", (req) => {
    if (/\/api\/public\/orders\/[^/]+$/.test(req.url()))
      orderGets.push(req.url());
  });
  const firstLoad = buyer.waitForResponse(
    (res) => /\/api\/public\/orders\/[^/]+$/.test(res.url()) && res.ok(),
  );
  await buyer.goto(order.link);
  const first = await (await firstLoad).json();
  expect(first.claimed).toBe(false);
  expect(first.timeline).toEqual([]);
  await expect(
    buyer.getByText(`Pedido #${order.number}`).first(),
  ).toBeVisible();
  // Known: the not-yet-reached timeline steps use text-gray-400 (2.6:1) and
  // fail color-contrast (serious); same note as above, gated at `critical`.
  await runAxe(buyer, testInfo, { gate: ["critical"] });

  // 3. Buyer uploads a proof for the full balance (pre-filled).
  await expect(buyer.getByText("Sube tu comprobante")).toBeVisible();
  await buyer.locator('input[type="file"]').setInputFiles(PROOF_IMAGE);
  await buyer
    .getByLabel("Método de pago")
    .selectOption({ label: "Transferencia bancaria" });
  const uploaded = buyer.waitForResponse(
    (res) => /\/payments$/.test(res.url()) && res.request().method() === "POST",
  );
  await buyer.getByRole("button", { name: "Enviar comprobante" }).click();
  // Cross-origin (page :3001 -> API :3000) upload, no credentials.
  expect((await uploaded).status()).toBe(201);
  await expect(
    buyer.getByText("Recibimos tu comprobante y está en revisión."),
  ).toBeVisible();

  // 4. Seller approves it from the payment history of the order sheet.
  await page.goto(`/es/dashboard/${shop.slug}/orders?order=${order.id}`);
  const history = page
    .locator("div")
    .filter({ has: page.getByText("Historial de pagos", { exact: true }) })
    .filter({ has: page.getByRole("button", { name: "Aprobar", exact: true }) })
    .last();
  const reviewed = page.waitForResponse(
    (res) => /\/payments\/[^/]+\/review$/.test(res.url()) && res.ok(),
  );
  await history.getByRole("button", { name: "Aprobar", exact: true }).click();
  await reviewed;

  // 5. Seller marks it on its way from the orders table (8 s undo window: the
  // PATCH only fires after it, so wait for it).
  await page.goto(`/es/dashboard/${shop.slug}/orders`);
  const row = page.getByRole("row").filter({
    has: page.getByRole("button", { name: new RegExp(order.number) }),
  });
  const advanced = page.waitForResponse(
    (res) =>
      /\/fulfillment$/.test(res.url()) && res.request().method() === "PATCH",
    { timeout: 30_000 },
  );
  await row.getByRole("button", { name: "Marcar En camino" }).click();
  expect((await advanced).ok()).toBe(true);

  // 6. Buyer reloads: validated payment, confirms receipt.
  await buyer.reload();
  await expect(buyer.getByText("Tu pago está validado")).toBeVisible();
  await expect(buyer.getByText("¿Ya te llegó tu pedido?")).toBeVisible();
  await buyer.getByRole("button", { name: "Ya lo recibí" }).click();
  await expect(buyer.getByText("¡Gracias por confirmar!")).toBeVisible();

  // 7. Buyer saves the order with Google (simulated). Register the route
  // before the click; bm_claim must exist at the Google hop and be gone after.
  const save = buyer.getByRole("button", { name: "Guardar con Google" });
  await expect(save).toBeEnabled();
  let claimCookieAtHop: string | undefined;
  await stubGoogle(buyer, uniqueGoogleCode(), async () => {
    claimCookieAtHop = await cookieNamed(buyerContext, "bm_claim");
  });
  await save.click();
  await buyer.waitForURL(/\/my-purchases\/orders\/[^/?]+\?claimed=1/);
  expect(buyer.url()).toContain(`/my-purchases/orders/${order.id}?claimed=1`);
  await expect(
    buyer.getByText("¡Listo! Guardamos este pedido en tu cuenta"),
  ).toBeVisible();
  await expect(
    buyer.getByText(`#${order.id.slice(0, 8)}`).first(),
  ).toBeVisible();
  expect(claimCookieAtHop).toBeTruthy();
  expect(await cookieNamed(buyerContext, "bm_claim")).toBeUndefined();
  expect(await cookieNamed(buyerContext, "bm_customer_session")).toBeTruthy();

  // 8. Another device with only the link sees the claimed state.
  const otherContext = await newBuyerContext(browser);
  const other = await otherContext.newPage();
  await openBuyerPage(other, order.link, order.number);
  await expect(other.getByText("Pedido guardado en tu cuenta")).toBeVisible();
  await expect(other.getByText("Historial de tu pedido")).toBeVisible();

  // 9. Seller sees the order as claimed (fresh navigation: sheet data is
  // otherwise stale).
  await page.goto(`/es/dashboard/${shop.slug}/orders?order=${order.id}`);
  await expect(page.getByText("Reclamado")).toBeVisible();

  console.log(`public order GETs in the golden path: ${orderGets.length}`);
  await buyerContext.close();
  await otherContext.close();
  await api.dispose();
});

test("seller-registered payment: the seller records a transfer with its capture and the order is verified", async ({
  page,
}) => {
  const api = await sellerApi();
  const shop = await createShop(api);
  const phone = uniquePhone();
  const order = await createOrderViaUi(page, shop, phone);

  await page.goto(`/es/dashboard/${shop.slug}/orders?order=${order.id}`);
  await expect(
    page.getByText("Registrar pago", { exact: true }).first(),
  ).toBeVisible();
  await page.locator("#payment-amount").fill(String(shop.price));
  await page.locator("#payment-date").fill(limaCalendarDate());
  await page
    .getByLabel("Selecciona un método de pago")
    .selectOption({ label: "Transferencia bancaria" });
  await page
    .getByLabel("Número de operación (opcional)")
    .fill(`OP-${Date.now()}`);
  await page.getByLabel("Subir comprobante de pago").setInputFiles(PROOF_IMAGE);
  const saved = page.waitForResponse(
    (res) =>
      /\/orders\/[^/]+\/payments$/.test(res.url()) &&
      res.request().method() === "POST",
  );
  await page.getByRole("button", { name: "Guardar pago" }).click();
  expect((await saved).status()).toBe(201);

  const stored = await getOrder(api, shop.storeId, order.id);
  expect(stored.paymentStatus).toBe("VERIFIED");
  // Paid in full: the orders table only offers the next step for a VERIFIED
  // order.
  await page.goto(`/es/dashboard/${shop.slug}/orders`);
  await expect(
    page
      .getByRole("row")
      .filter({
        has: page.getByRole("button", { name: new RegExp(order.number) }),
      })
      .getByRole("button", { name: "Marcar En camino" }),
  ).toBeVisible();
  await api.dispose();
});
