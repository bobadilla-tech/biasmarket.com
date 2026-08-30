import { test, expect } from "@playwright/test";
import { runAxe } from "./axe-helper";

/**
 * The blocking smoke suite covers the public landing/auth surfaces and the
 * route-specific marketing/onboarding pages. Authenticated dashboard routes
 * remain covered by component tests until CI has stable seeded sessions.
 */

test("landing (/es) renders and passes an axe serious-impact scan", async ({
  page,
}, testInfo) => {
  const response = await page.goto("/es");
  expect(response?.ok()).toBeTruthy();
  await expect(page.locator("h1:visible").first()).toBeVisible();
  await runAxe(page, testInfo, { gate: ["critical", "serious"] });
});

test("seller login (/es/login) renders and passes an axe serious-impact scan", async ({
  page,
}, testInfo) => {
  const response = await page.goto("/es/login");
  expect(response?.ok()).toBeTruthy();
  await expect(
    page.getByRole("button", {
      name: /iniciar sesión|log in|entrar|ingresar/i,
    }),
  ).toBeVisible();
  await runAxe(page, testInfo, { gate: ["critical", "serious"] });
});

test("marketing and onboarding routes pass the serious-impact axe scan", async ({
  page,
}, testInfo) => {
  for (const route of [
    "/es/founder",
    "/es/enterprise",
    "/es/contact",
    "/es/blog",
    "/es/onboarding",
  ]) {
    const response = await page.goto(route);
    expect(response?.ok(), `${route} should respond successfully`).toBeTruthy();
    await expect(page.locator("h1:visible").first()).toBeVisible();
    await runAxe(page, testInfo, { gate: ["critical", "serious"] });
  }
});
