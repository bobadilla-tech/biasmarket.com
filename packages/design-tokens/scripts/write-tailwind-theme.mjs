import { writeFile } from "node:fs/promises";
import { buildTailwindThemeCss } from "../dist/tailwind-theme.js";

const css = buildTailwindThemeCss();
await Promise.all([
  writeFile(new URL("../src/theme.css", import.meta.url), css),
  writeFile(new URL("../dist/theme.css", import.meta.url), css),
]);
