import { expect } from "vitest";
import { configureAxe } from "vitest-axe";
import type { AxeResults, Result as AxeRuleResult } from "axe-core";

/**
 * jsdom + axe-core caveats this helper is built around (see the audit's
 * "False-confidence traps"):
 *
 * - jsdom applies **no** stylesheet layout, so `color-contrast` (and any rule
 *   needing geometry) resolves to `incomplete`, never `pass`. A test that only
 *   checks `violations` would silently ignore a real contrast regression.
 *   `expectNoA11yViolations` therefore fails on non-allowlisted `incomplete`
 *   results too — the honest jsdom signal is "cannot tell", and that must be
 *   surfaced, not swallowed.
 * - Real contrast / focus-visibility / reflow / announcement checks belong in
 *   Playwright against `next start`, not here.
 *
 * Use this only on the **new** `Field` / `Dialog` / `RadioCardGroup` / `Menu`
 * primitives (Phase 1+), not on the thin Base UI re-exports.
 */

// Rules that are inherently unresolvable under jsdom (no layout engine). A
// component test allowlists these knowingly; a Playwright test must still cover
// them for real.
const JSDOM_UNRESOLVABLE = [
  "color-contrast",
  "target-size",
  "scrollable-region-focusable",
] as const;

export const axe = configureAxe({
  rules: {
    // `region` flags any node outside a landmark — irrelevant when rendering a
    // single primitive in isolation.
    region: { enabled: false },
  },
});

function formatRule(r: AxeRuleResult): string {
  const nodes = r.nodes
    .map((n) => `      ${n.html}\n        ${n.failureSummary ?? ""}`)
    .join("\n");
  return `  [${r.id}] ${r.help} (${r.helpUrl})\n${nodes}`;
}

export interface A11yAssertionOptions {
  /**
   * axe rule ids whose `incomplete` result is acceptable for this test
   * (typically because jsdom cannot resolve them). Defaults to the
   * layout-dependent rules that jsdom can never complete.
   */
  allowIncomplete?: readonly string[];
}

/**
 * Assert an {@link AxeResults} has no `violations` and no `incomplete` results
 * outside the allowlist. Fails loudly with the offending rules + nodes.
 */
export function expectNoA11yViolations(
  results: AxeResults,
  { allowIncomplete = JSDOM_UNRESOLVABLE }: A11yAssertionOptions = {},
): void {
  const allowed = new Set(allowIncomplete);

  expect(
    results.violations,
    results.violations.length
      ? `axe found ${results.violations.length} violation(s):\n${results.violations
          .map(formatRule)
          .join("\n")}`
      : "",
  ).toHaveLength(0);

  const blockingIncomplete = results.incomplete.filter(
    (r) => !allowed.has(r.id),
  );
  expect(
    blockingIncomplete,
    blockingIncomplete.length
      ? `axe could not verify ${blockingIncomplete.length} rule(s) and they are ` +
          `not allowlisted — resolve or add to allowIncomplete:\n${blockingIncomplete
            .map(formatRule)
            .join("\n")}`
      : "",
  ).toHaveLength(0);
}
