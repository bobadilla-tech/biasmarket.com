// Generates the default Open Graph image at public/og-image.png.
// Uses next/og (Satori + resvg, bundled with Next) — no extra deps needed.
// Usage: pnpm --filter web og:generate

import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createElement } from "react";
import { ImageResponse } from "next/og.js";

const outPath = join(
  dirname(fileURLToPath(import.meta.url)),
  "..",
  "public",
  "og-image.png",
);

const element = createElement(
  "div",
  {
    style: {
      height: "100%",
      width: "100%",
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      justifyContent: "center",
      backgroundImage: "linear-gradient(135deg, #7c3aed 0%, #16121c 55%, #ec4899 100%)",
      fontFamily: "sans-serif",
    },
  },
  createElement(
    "div",
    {
      style: {
        fontSize: 96,
        fontWeight: 700,
        color: "white",
        letterSpacing: -2,
      },
    },
    "Bias Market",
  ),
  createElement(
    "div",
    {
      style: {
        marginTop: 28,
        fontSize: 34,
        color: "rgba(255,255,255,0.85)",
        maxWidth: 860,
        textAlign: "center",
      },
    },
    "Storefronts for K-pop merch & photocard sellers",
  ),
  createElement("div", {
    style: {
      marginTop: 48,
      width: 120,
      height: 6,
      borderRadius: 999,
      backgroundColor: "#f5c451",
    },
  }),
);

const response = new ImageResponse(element, { width: 1200, height: 630 });
const buffer = Buffer.from(await response.arrayBuffer());

writeFileSync(outPath, buffer);
console.log(`Wrote ${outPath}`);
