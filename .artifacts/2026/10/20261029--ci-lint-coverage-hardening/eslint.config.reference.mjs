// REFERENCE ONLY (not wired into the repo). Derived from the probe config that
// produced the baselines in plan.md (P5/P6) and was re-checked by a reviewer for
// cwd lookup from package dirs. Copy to repo root as `eslint.config.mjs`, then
// re-run the baselines on a fresh origin/main.
import js from "@eslint/js";
import babelParser from "@babel/eslint-parser";
import globals from "globals";

export const baseConfig = [
  {
    ignores: [
      "**/dist/**",
      "**/node_modules/**",
      "**/coverage/**",
      "**/generated/**",
      "**/.next/**",
      "**/.expo/**",
      // Generated; mirror .prettierignore.
      "apps/api/src/metadata.ts",
      "apps/api/openapi.json",
    ],
  },
  ...[
    ["**/*.ts", ["typescript", "decorators-legacy", "importAttributes"]],
    ["**/*.{tsx,jsx}", ["typescript", "jsx", "importAttributes"]],
    ["**/*.{js,mjs,cjs}", ["importAttributes"]],
  ].map(([files, plugins]) => ({
    files: [files],
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "module",
      parser: babelParser,
      parserOptions: {
        requireConfigFile: false,
        // `jsx` only for tsx/jsx: on .ts it mis-parses `<T>x` assertions.
        babelOptions: {
          babelrc: false,
          configFile: false,
          parserOpts: { plugins },
        },
      },
      globals: { ...globals.node, ...globals.es2025 },
    },
    rules: {
      ...js.configs.recommended.rules,
      // tsc is the authority for these; the base rules false-positive on TS.
      "no-undef": "off",
      "no-unused-vars": "off",
      "no-redeclare": "off",
      "no-dupe-class-members": "off",
    },
  })),
];

export default baseConfig;
