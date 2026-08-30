import type { Page, TestInfo } from "@playwright/test";
import { expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

/**
 * Run axe against the current page, attach the full result to the test report,
 * and fail on the impacts selected by the caller. Phase 7 gates both critical
 * and serious violations for the audited route smoke coverage.
 */
export async function runAxe(
  page: Page,
  testInfo: TestInfo,
  { gate = ["critical"] as string[] } = {},
): Promise<void> {
  const results = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"])
    .analyze();

  await testInfo.attach("axe-results.json", {
    body: JSON.stringify(results.violations, null, 2),
    contentType: "application/json",
  });

  const gated = results.violations.filter((v) => gate.includes(v.impact ?? ""));
  console.log(
    `[axe] ${page.url()} total=${results.violations.length} gated=${gated.length}` +
      (results.violations.length
        ? ` details=${results.violations
            .map(
              (v) =>
                `${v.id}:${v.impact}:${v.nodes.map((node) => node.target.join(" ")).join(";")}`,
            )
            .join(" | ")}`
        : ""),
  );
  expect(
    gated,
    gated.length
      ? `axe found ${gated.length} ${gate.join("/")} violation(s):\n` +
          gated
            .map((v) => `  [${v.id}] ${v.help} — ${v.nodes.length} node(s)`)
            .join("\n")
      : "",
  ).toEqual([]);
}
