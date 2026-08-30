import { test, expect, type Page } from "@playwright/test";

/**
 * Exercise narrow, landscape, and short-height auth layouts that are not
 * represented by the shared 375/768/desktop Playwright projects.
 */
const desktopOnly = (projectName: string) => {
  test.skip(projectName !== "desktop", "run each custom viewport once");
};

async function expectAuthLayout(page: Page) {
  const response = await page.goto("/es/login");
  expect(response?.ok()).toBeTruthy();
  await expect(page.locator("h1:visible").first()).toBeVisible();
  await expect(
    page.getByRole("button", {
      name: /iniciar sesión|log in|entrar|ingresar/i,
    }),
  ).toBeVisible();

  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth > window.innerWidth + 1,
  );
  expect(overflow, "auth layout must not overflow horizontally").toBeFalsy();
}

test.describe("320px auth layout", () => {
  test.use({ viewport: { width: 320, height: 800 } });

  test("remains usable", async ({ page }, testInfo) => {
    desktopOnly(testInfo.project.name);
    await expectAuthLayout(page);
  });
});

test.describe("375px short auth layout", () => {
  test.use({ viewport: { width: 375, height: 480 } });

  test("remains usable with a short viewport", async ({ page }, testInfo) => {
    desktopOnly(testInfo.project.name);
    await expectAuthLayout(page);
  });
});

test.describe("landscape auth layout", () => {
  test.use({ viewport: { width: 812, height: 375 } });

  test("remains usable in landscape", async ({ page }, testInfo) => {
    desktopOnly(testInfo.project.name);
    await expectAuthLayout(page);
  });
});
