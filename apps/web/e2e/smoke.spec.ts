import { test, expect } from "@playwright/test";
import { runAxe } from "./axe-helper";

/**
 * Phase 0 smoke: the harness itself works end to end — a real build serves,
 * axe runs, the report attaches. Broader route/viewport coverage lands with
 * the phase that fixes each flow.
 */

test("landing (/es) renders and passes an axe critical-impact scan", async ({
  page,
}, testInfo) => {
  const response = await page.goto("/es");
  expect(response?.ok()).toBeTruthy();
  await expect(page.locator("h1:visible").first()).toBeVisible();
  await runAxe(page, testInfo);
});

test("seller login (/es/login) renders and passes an axe critical-impact scan", async ({
  page,
}, testInfo) => {
  const response = await page.goto("/es/login");
  expect(response?.ok()).toBeTruthy();
  await expect(
    page.getByRole("button", {
      name: /iniciar sesión|log in|entrar|ingresar/i,
    }),
  ).toBeVisible();
  await runAxe(page, testInfo);
});
