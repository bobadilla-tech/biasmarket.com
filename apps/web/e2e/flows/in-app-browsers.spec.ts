import { expect, test } from "@playwright/test";
import { openBuyerPage, PROOF_IMAGE } from "./helpers/assisted-order";
import { uniquePhone } from "./helpers/phones";
import {
  createAssistedOrder,
  createShop,
  recordPayment,
  sellerApi,
} from "./helpers/seller-api";

// Links opened from Instagram / X (Twitter) / Facebook land in an in-app
// browser, where Google refuses to sign in. This covers the DETECTION BRANCH
// only (features/public-order/lib/in-app-browser.ts reads navigator.userAgent):
// a Chromium with the UA of those apps, not their real engines. WhatsApp is
// deliberately absent: it opens a real browser (Custom Tabs / SFSafariViewController)
// and is not in the detection list.
const IN_APP = [
  {
    name: "Instagram",
    userAgent:
      "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Instagram 330.0.0.20.113",
  },
  {
    name: "Twitter",
    userAgent:
      "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Twitter for iPhone/10.45",
  },
  {
    name: "Facebook",
    userAgent:
      "Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Mobile Safari/537.36 [FB_IAB/FB4A;FBAV/470.0.0.40.108;]",
  },
] as const;

for (const app of IN_APP) {
  test(`${app.name} in-app browser: the order stays usable and Google is never started`, async ({
    browser,
  }) => {
    const api = await sellerApi();
    const shop = await createShop(api);
    // A partial validated payment: the invitation shows (it needs a validated
    // payment) AND the order still takes a proof (it needs a balance left).
    const order = await createAssistedOrder(api, shop, uniquePhone().e164, {
      partial: true,
    });
    await recordPayment(api, shop, order.id, 10);

    const ctx = await browser.newContext({
      storageState: { cookies: [], origins: [] },
      viewport: { width: 375, height: 812 },
      reducedMotion: "reduce",
      userAgent: app.userAgent,
      permissions: ["clipboard-read", "clipboard-write"],
    });
    const buyer = await ctx.newPage();
    const started: string[] = [];
    buyer.on("request", (req) => {
      if (
        req.url().includes("/api/account/google") ||
        req.url().includes("/claim-ticket")
      ) {
        started.push(req.url());
      }
    });

    // The order itself first: a generated number and the total (positive
    // markers), then the in-app note, which only appears after hydration.
    await openBuyerPage(buyer, order.link, order.number);
    await expect(buyer.getByText("PEN 100").first()).toBeVisible();
    const note = buyer
      .getByRole("note")
      .filter({ hasText: "Ábrelo en tu navegador" });
    await expect(note).toBeVisible();

    // No Google button and no claim request; the buyer can still pay.
    await expect(
      buyer.getByRole("button", { name: "Guardar con Google" }),
    ).toHaveCount(0);
    await expect(buyer.getByText("Sube tu comprobante")).toBeVisible();
    await expect(buyer.locator('input[type="file"]')).toBeAttached();
    await buyer.locator('input[type="file"]').setInputFiles(PROOF_IMAGE);

    // "Copiar enlace" writes the exact private link.
    await buyer.getByRole("button", { name: "Copiar enlace" }).click();
    await expect(buyer.getByText("Enlace copiado")).toBeVisible();
    expect(await buyer.evaluate(() => navigator.clipboard.readText())).toBe(
      order.link,
    );

    expect(started).toEqual([]);
    await ctx.close();
    await api.dispose();
  });
}

test("a normal browser gets the Google button, not the in-app note (control)", async ({
  browser,
}) => {
  const api = await sellerApi();
  const shop = await createShop(api);
  const order = await createAssistedOrder(api, shop, uniquePhone().e164, {
    partial: true,
  });
  await recordPayment(api, shop, order.id, 10);
  const ctx = await browser.newContext({
    storageState: { cookies: [], origins: [] },
    viewport: { width: 375, height: 812 },
  });
  const buyer = await ctx.newPage();
  await openBuyerPage(buyer, order.link, order.number);
  await expect(
    buyer.getByRole("button", { name: "Guardar con Google" }),
  ).toBeEnabled();
  await expect(buyer.getByText("Ábrelo en tu navegador")).toHaveCount(0);
  await ctx.close();
  await api.dispose();
});
