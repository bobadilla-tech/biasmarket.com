import { describe, expect, it } from "vitest";
import { buildProductJsonLd, serializeJsonLd } from "./product-json-ld";

describe("product JSON-LD", () => {
  it("builds an in-stock offer that points at the product detail URL", () => {
    const productUrl = "https://biasmarket.com/es/store/demo/product/product-1";

    expect(
      buildProductJsonLd(
        {
          name: "Photocard",
          images: ["https://cdn.biasmarket.com/product.jpg"],
          price: "12.50",
          currency: "PEN",
          soldOut: false,
          variants: [{ stock: 2, reserved: 0 }],
        },
        productUrl,
      ),
    ).toMatchObject({
      "@type": "Product",
      name: "Photocard",
      image: "https://cdn.biasmarket.com/product.jpg",
      offers: {
        price: "12.50",
        priceCurrency: "PEN",
        availability: "https://schema.org/InStock",
        url: productUrl,
      },
    });
  });

  it("marks unavailable products out of stock", () => {
    const result = buildProductJsonLd(
      {
        name: "Sold out",
        price: 10,
        currency: "PEN",
        soldOut: true,
      },
      "https://biasmarket.com/product",
    );

    expect(result.offers.availability).toBe("https://schema.org/OutOfStock");
  });

  it("escapes markup-significant characters before embedding JSON", () => {
    expect(serializeJsonLd({ name: "</script>" })).toContain("\\u003c/script>");
  });
});
