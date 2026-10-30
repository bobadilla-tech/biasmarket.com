import reactHooks from "eslint-plugin-react-hooks";
import globals from "globals";
import { baseRules, parserFor } from "../../eslint.config.mjs";

export default [
  {
    ignores: [".expo/**", "coverage/**", "dist/**", "node_modules/**"],
  },
  {
    files: ["**/*.{js,jsx,ts,tsx,mjs,cjs}"],
    languageOptions: parserFor(["typescript", "jsx", "importAttributes"], {
      ...globals.browser,
      React: "readonly",
      JSX: "readonly",
    }),
    plugins: {
      "react-hooks": reactHooks,
    },
    rules: {
      ...baseRules,
      ...reactHooks.configs.flat.recommended.rules,
    },
  },
];
