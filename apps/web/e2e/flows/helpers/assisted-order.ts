import {
  expect,
  type Browser,
  type BrowserContext,
  type Page,
} from "@playwright/test";
import { findOrderByPhone, sellerApi, type Shop } from "./seller-api";

// Proof image: any small PNG works (the API checks magic bytes, 5 MB max).
export const PROOF_IMAGE = "public/og-image.png";

export interface CreatedOrder {
  id: string;
  /** What the order is called on screen (last 6 of the id, uppercase). */
  number: string;
  /** The buyer's private link, read from the created screen. */
  link: string;
}

export interface CreateOptions {
  /** Label of the payment method option, e.g. "Transferencia bancaria". */
  paymentMethod?: string;
  /** "Adelanto de 30%" turns the order into a pickup deposit order. */
  partial?: boolean;
}

// Drives the real "Nuevo pedido" form once. Click "Crear pedido" exactly once:
// the UI sends an Idempotency-Key and a replay returns 409 without the link.
export async function createOrderViaUi(
  page: Page,
  shop: Shop,
  phone: { national: string; e164: string },
  options: CreateOptions = {},
): Promise<CreatedOrder> {
  await page.goto(`/es/dashboard/${shop.slug}/orders`);
  await page.getByRole("button", { name: "Nuevo pedido" }).click();
  await page.locator("#assisted-phone").fill(phone.national);
  await page
    .locator("#assisted-item-0-product")
    .selectOption({ label: shop.productName });
  if (options.paymentMethod) {
    await page
      .locator("#assisted-payment-method")
      .selectOption({ label: options.paymentMethod });
  }
  if (options.partial) {
    await page.locator("#assisted-payment-type").selectOption({ index: 1 });
  }
  await page.getByRole("button", { name: "Crear pedido" }).click();

  const message = page.locator("#assisted-link-message");
  await expect(message).toBeVisible();
  const text = await message.inputValue();
  const link = text.match(/https?:\/\/\S+\/pedido\/[\w-]+/)?.[0];
  if (!link) throw new Error("created screen showed no private link");

  const api = await sellerApi();
  try {
    const order = await findOrderByPhone(api, shop.storeId, phone.e164);
    return { id: order.id, number: order.id.slice(-6).toUpperCase(), link };
  } finally {
    await api.dispose();
  }
}

// A buyer: no cookies, nothing shared with the seller's session.
export async function newBuyerContext(
  browser: Browser,
): Promise<BrowserContext> {
  return browser.newContext({
    storageState: { cookies: [], origins: [] },
    viewport: { width: 375, height: 812 },
    reducedMotion: "reduce",
  });
}

// Opens the private link and waits for the order itself (not just the shell:
// negative assertions are only safe after a positive marker).
export async function openBuyerPage(page: Page, link: string, number: string) {
  const loaded = page.waitForResponse(
    (res) => /\/api\/public\/orders\/[^/]+$/.test(res.url()) && res.ok(),
  );
  await page.goto(link);
  await loaded;
  await expect(page.getByText(`Pedido #${number}`).first()).toBeVisible();
}
