import { expect, type Page, test } from "@playwright/test";

const storeSlug = process.env.WEB_E2E_STORE_SLUG ?? "demo-tienda-de-camila";
const sellerEmail =
  process.env.WEB_E2E_SELLER_EMAIL ?? "seed-seller1@biasmarket.dev";
const sellerPassword = process.env.WEB_E2E_SELLER_PASSWORD ?? "seedpassword123";
const apiUrl = process.env.WEB_E2E_API_URL ?? "http://localhost:3000";

/**
 * Browser zoom controls are not exposed consistently across engines. This
 * fixture doubles computed text sizes without scaling layout dimensions, which
 * models WCAG 1.4.4 text-only zoom and catches fixed-height clipping.
 */
async function applyTextOnlyZoom(page: Page) {
  await page.evaluate(() => {
    for (const element of document.querySelectorAll<HTMLElement>("body *")) {
      const style = globalThis.getComputedStyle(element);
      const fontSize = Number.parseFloat(style.fontSize);
      if (Number.isFinite(fontSize) && fontSize > 0) {
        element.style.fontSize = `${fontSize * 2}px`;
      }

      const lineHeight = Number.parseFloat(style.lineHeight);
      if (Number.isFinite(lineHeight) && lineHeight > 0) {
        element.style.lineHeight = `${lineHeight * 2}px`;
      }
    }
  });
  await page.waitForTimeout(50);
}

async function expectVisibleControlsNotClipped(page: Page) {
  const clipped = await page
    .locator("button, a, input, select, textarea")
    .evaluateAll((elements) =>
      elements
        .filter((element) => {
          const style = globalThis.getComputedStyle(element);
          return (
            style.display !== "none" &&
            style.visibility !== "hidden" &&
            !element.classList.contains("sr-only")
          );
        })
        .filter((element) => {
          const rect = element.getBoundingClientRect();
          const hasVisibleText =
            element.matches("input, select, textarea") ||
            (!element.hasAttribute("aria-label") &&
              Array.from(element.childNodes).some((node) => {
                if (node.nodeType === Node.TEXT_NODE) {
                  return Boolean(node.textContent?.trim());
                }
                return (
                  node instanceof HTMLElement &&
                  !node.classList.contains("sr-only") &&
                  Boolean(node.textContent?.trim())
                );
              }));

          return (
            hasVisibleText &&
            rect.width > 0 &&
            rect.height > 0 &&
            (element.scrollWidth > element.clientWidth + 1 ||
              element.scrollHeight > element.clientHeight + 1)
          );
        })
        .map((element) => ({
          tag: element.tagName.toLowerCase(),
          text: (
            element.textContent ??
            element.getAttribute("aria-label") ??
            ""
          )
            .trim()
            .slice(0, 100),
          className: element.className,
        })),
    );

  expect(clipped, "visible controls must grow with their text").toEqual([]);
}

async function signInSeller(page: Page) {
  await page.goto("/es/login");
  const response = await page.request.post(`${apiUrl}/api/auth/sign-in/email`, {
    data: { email: sellerEmail, password: sellerPassword },
    headers: { Origin: new URL(page.url()).origin },
  });
  expect(response.ok()).toBeTruthy();
  await page.goto(`/es/dashboard/${storeSlug}/orders`);
  await expect(page).toHaveURL(/\/es\/dashboard\//);
}

test("landing controls survive 200% text-only zoom", async ({ page }) => {
  await page.goto("/es");
  await expect(page.locator("h1:visible").first()).toBeVisible();
  await page.waitForLoadState("networkidle");
  await applyTextOnlyZoom(page);
  await expectVisibleControlsNotClipped(page);
});

test("checkout controls survive 200% text-only zoom", async ({ page }) => {
  await page.goto(`/es/store/${storeSlug}`);
  await page
    .getByRole("button", { name: /agregar al carrito|add to cart/i })
    .first()
    .click();
  await page.goto(`/es/store/${storeSlug}/checkout`);
  await expect(page.locator("h1:visible").first()).toBeVisible();
  await applyTextOnlyZoom(page);
  await expectVisibleControlsNotClipped(page);
});

test("seller orders controls survive 200% text-only zoom", async ({
  page,
}, testInfo) => {
  // One authenticated pass is enough for this regression. Keeping it on the
  // desktop project avoids three identical sign-ins hitting Better Auth's
  // shared per-IP rate limiter in CI; mobile/tablet dashboard controls are
  // covered by the same component markup and the responsive orders tests.
  test.skip(testInfo.project.name !== "desktop", "desktop authenticated pass");
  await signInSeller(page);
  await expect(page.locator("h1:visible").first()).toBeVisible();
  await applyTextOnlyZoom(page);
  await expectVisibleControlsNotClipped(page);
});
