import babelParser from "@babel/eslint-parser";
import reactHooks from "eslint-plugin-react-hooks";
import globals from "globals";
import { baseRules } from "../../eslint.config.mjs";

export default [
  {
    ignores: [".expo/**", "coverage/**", "dist/**", "node_modules/**"],
  },
  {
    files: ["**/*.{js,jsx,ts,tsx,mjs,cjs}"],
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "module",
      parser: babelParser,
      parserOptions: {
        requireConfigFile: false,
        babelOptions: {
          babelrc: false,
          configFile: false,
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
      },
    },
    plugins: {
      "react-hooks": reactHooks,
    },
    rules: {
      ...baseRules,
      ...reactHooks.configs.flat.recommended.rules,
    },
  },
];
