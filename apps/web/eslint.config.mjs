import globals from "globals";
import jsxA11y from "eslint-plugin-jsx-a11y";
import reactHooks from "eslint-plugin-react-hooks";
import babelParser from "@babel/eslint-parser";

/**
 * Flat ESLint config for `apps/web` — the a11y regression guard (audit Phase 0).
 *
 * Why this shape (Phase 0 spike result, all verified against the toolchain):
 * - Next 16 removed `next lint`. The flat entry point is
 *   `eslint-config-next/core-web-vitals`, which bundles react / react-hooks /
 *   `@next/next` but **no jsx-a11y** — jsx-a11y needs its own block regardless.
 * - `apps/web` pins `typescript@^7.0.2` (`@typescript/native-preview`); that
 *   `typescript` npm package ships **no compiler API**
 *   (`require("typescript").createSourceFile === undefined`, verified). So
 *   `@typescript-eslint/parser` — and therefore `eslint-config-next`, which
 *   depends on it — cannot instantiate. Typed linting is off the table until
 *   the TS7 native toolchain exposes an API.
 * - Fallback (audit Phase 0 "decide by yourself"): parse TS/TSX with
 *   `@babel/eslint-parser` (AST-only, no `typescript` dependency) and run
 *   `eslint-plugin-jsx-a11y`, which needs only the ESTree/JSX AST.
 *
 * `eslint-config-next`'s react / react-hooks / `@next/next` blocks are
 * intentionally NOT reconstructed here — Phase 0's scope is the a11y harness.
 * Active rules are blocking errors; intentionally disabled rules remain off.
 */

// Keep explicitly disabled compatibility rules disabled while making active
// jsx-a11y rules blocking now that the baseline is clean.
const a11yRecommended = jsxA11y.flatConfigs.recommended.rules;
const a11yRules = Object.fromEntries(
  Object.entries({
    ...a11yRecommended,
    // Named explicitly in the audit's Phase 0 scope — pin them on even if a
    // future plugin bump drops one from `recommended`.
    "jsx-a11y/label-has-associated-control": 0,
    "jsx-a11y/no-static-element-interactions": 0,
    "jsx-a11y/interactive-supports-focus": 0,
    "jsx-a11y/anchor-is-valid": 0,
    "jsx-a11y/no-noninteractive-element-interactions": 0,
    "jsx-a11y/role-has-required-aria-props": 0,
    "jsx-a11y/control-has-associated-label": 0,
    "jsx-a11y/no-autofocus": 0,
  }).map(([rule, config]) => [
    rule,
    config === 0 || config === "off" ? "off" : "error",
  ]),
);

export default [
  {
    ignores: [
      ".next/**",
      "next-env.d.ts",
      "coverage/**",
      "playwright-report/**",
      "test-results/**",
      "node_modules/**",
      "**/*.config.{js,mjs,ts}",
      "scripts/**",
    ],
  },
  {
    files: ["**/*.{js,jsx,ts,tsx,mts}"],
    // Source carries legacy `eslint-disable` directives for rules this config
    // does not enable (`react-hooks/*`, one `security/detect-unsafe-url` from a
    // DeepSource annotation). Don't flag them as unused — they document intent
    // and belong to tools outside this harness's scope.
    linterOptions: {
      reportUnusedDisableDirectives: "off",
    },
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "module",
      parser: babelParser,
      parserOptions: {
        requireConfigFile: false,
        babelOptions: {
          babelrc: false,
          configFile: false,
          // Babel 8's `@babel/eslint-parser` does not pick up
          // `@babel/preset-typescript`'s syntax plugins for parse-only use;
          // enable the syntax plugins directly. `typescript` + `jsx` together
          // is TSX parsing mode — fine for lint (no emit).
          parserOpts: {
            plugins: ["typescript", "jsx", "importAttributes"],
          },
        },
      },
      globals: {
        ...globals.browser,
        ...globals.node,
        ...globals.es2025,
        React: "readonly",
        JSX: "readonly",
        NodeJS: "readonly",
      },
    },
    plugins: {
      "jsx-a11y": jsxA11y,
      // Registered but with **no rules enabled** — several source files carry
      // legacy `eslint-disable react-hooks/*` directives, and an unknown-rule
      // reference in a disable directive is itself an ESLint error. Enabling
      // the plugin (rules still off) makes those directives resolve silently.
      // A real react-hooks `warn` block is a later, separate change.
      "react-hooks": reactHooks,
      // No-op shim so a lone `eslint-disable security/detect-unsafe-url`
      // directive (a DeepSource rule, not an ESLint one) resolves instead of
      // erroring as unknown. The rule must be *defined* to satisfy the
      // directive checker, so give it an inert `create`.
      security: { rules: { "detect-unsafe-url": { create: () => ({}) } } },
    },
    settings: {
      "jsx-a11y": {
        // shadcn / Base UI wrappers forward props to a real element; teach the
        // plugin the common polymorphic component names so their a11y props
        // are still checked.
        components: {
          Button: "button",
          IconButton: "button",
          Link: "a",
          NextLink: "a",
          Image: "img",
          Input: "input",
          Textarea: "textarea",
          Select: "select",
        },
      },
    },
    rules: a11yRules,
  },
];
