import fs from "node:fs";
import path from "node:path";
import { describe, expect, test } from "vitest";
import robots from "@/app/robots";

// Guards against the exact class of bug this repo shipped once already (see
// docs/plans/2026-08-20-seo-strategy-review-plan.md Phase 1/4): a new page
// ships under app/[locale] with neither a self-referential canonical nor an
// explicit noindex, and silently becomes a duplicate-content GSC issue.
// Pages already covered by a blanket robots.txt disallow (derived from
// robots.ts itself, not hand-duplicated here) are exempt — per that plan,
// once a page is disallowed, canonical/noindex on it is moot.

const APP_LOCALE_DIR = path.join(__dirname, "..", "app", "[locale]");

function globToRegExp(glob: string): RegExp {
  const anchored = glob.endsWith("$");
  const body = anchored ? glob.slice(0, -1) : glob;
  const pattern = body
    .split("*")
    .map((segment) => segment.replace(/[.+?^${}()|[\]\\]/g, "\\$&"))
    .join(".*");
  return new RegExp(`^${pattern}${anchored ? "$" : ".*"}`);
}

function disallowPatterns(): string[] {
  const { rules } = robots();
  const ruleList = Array.isArray(rules) ? rules : [rules];
  return ruleList.flatMap((rule) => {
    const { disallow } = rule;
    if (!disallow) return [];
    return Array.isArray(disallow) ? disallow : [disallow];
  });
}

function isRobotsDisallowed(pathname: string): boolean {
  const patterns = disallowPatterns().map(globToRegExp);
  return ["es", "en"].some((locale) =>
    patterns.some((re) => re.test(`/${locale}${pathname}`)),
  );
}

function findPageFiles(dir: string): string[] {
  const found: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      found.push(...findPageFiles(fullPath));
    } else if (entry.name === "page.tsx") {
      found.push(fullPath);
    }
  }
  return found;
}

function toPathname(filePath: string): string {
  const relative = path.relative(APP_LOCALE_DIR, filePath);
  const segments = relative
    .split(path.sep)
    .slice(0, -1) // drop "page.tsx"
    .filter((segment) => !/^\(.*\)$/.test(segment)); // drop route groups
  return segments.length === 0 ? "" : `/${segments.join("/")}`;
}

describe("canonical regression", () => {
  const pageFiles = findPageFiles(APP_LOCALE_DIR);
  expect(pageFiles.length).toBeGreaterThan(0);

  for (const file of pageFiles) {
    const pathname = toPathname(file);
    if (isRobotsDisallowed(pathname)) continue;

    test(`${pathname || "/"} exports a canonical or is noindex'd`, () => {
      const source = fs.readFileSync(file, "utf8");
      const hasGenerateMetadata =
        /export\s+async function\s+generateMetadata/.test(source);
      expect(
        hasGenerateMetadata,
        `${file} has no generateMetadata export`,
      ).toBe(true);

      const hasCanonical = /alternates:\s*\{[\s\S]*?canonical/.test(source);
      const hasNoindex = /index:\s*false/.test(source);
      expect(
        hasCanonical || hasNoindex,
        `${file} exports neither alternates.canonical nor robots noindex — ` +
          "add canonicalUrl(locale, path) or robots: { index: false }",
      ).toBe(true);
    });
  }
});
