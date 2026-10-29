// Shared ESLint config for backend and packages (api, workers, db, i18n, queue,
// types, design-tokens, utils, query, validation). ESLint resolves the nearest
// config from the cwd upward, so a workspace without its own file picks this
// up. web, mobile and sanity keep local configs. Do not add a root `lint`
// script that runs `eslint .`: it would apply this config to those three.
//
// `typescript-eslint` cannot load on TypeScript 7, so TS is parsed with
// @babel/eslint-parser (AST only). `tsc` is the authority for undefined or
// unused identifiers and redeclarations, so the base rules for those are off.
import js from "@eslint/js";
import babelParser from "@babel/eslint-parser";
import globals from "globals";

const parserFor = (plugins) => ({
  ecmaVersion: "latest",
  sourceType: "module",
  parser: babelParser,
  parserOptions: {
    requireConfigFile: false,
    babelOptions: {
      babelrc: false,
      configFile: false,
      parserOpts: { plugins },
    },
  },
  globals: { ...globals.node, ...globals.es2025 },
});

export const baseRules = {
  ...js.configs.recommended.rules,
  "no-undef": "off",
  "no-unused-vars": "off",
  "no-redeclare": "off",
  "no-dupe-class-members": "off",
};

export const baseConfig = [
  {
    // Mirror .prettierignore for generated files.
    ignores: [
      "**/dist/**",
      "**/node_modules/**",
      "**/coverage/**",
      "**/generated/**",
      "**/.next/**",
      "**/.expo/**",
      "apps/api/src/metadata.ts",
      "apps/api/openapi.json",
    ],
  },
  {
    // `jsx` stays off for .ts: it mis-parses `<T>x` type assertions.
    files: ["**/*.ts"],
    languageOptions: parserFor([
      "typescript",
      "decorators-legacy",
      "importAttributes",
    ]),
    rules: baseRules,
  },
  {
    files: ["**/*.{tsx,jsx}"],
    languageOptions: parserFor(["typescript", "jsx", "importAttributes"]),
    rules: baseRules,
  },
  {
    files: ["**/*.{js,mjs,cjs}"],
    languageOptions: parserFor(["importAttributes"]),
    rules: baseRules,
  },
];

export default baseConfig;
