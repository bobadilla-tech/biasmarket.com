import { isProductOutOfStock } from "@/features/discovery/lib/product-stock";

type ProductJsonLdInput = {
  name: string;
  images?: string[];
  price: string | number;
  currency: string;
  soldOut?: boolean;
  variants?: Array<{ stock: number | null; reserved: number }>;
};

export function buildProductJsonLd(product: ProductJsonLdInput, url: string) {
  return {
    "@type": "Product",
    name: product.name,
    ...(product.images?.[0] && { image: product.images[0] }),
    offers: {
      "@type": "Offer",
      price: String(product.price),
      priceCurrency: product.currency,
      availability: isProductOutOfStock({
        soldOut: product.soldOut ?? false,
        variants: product.variants ?? [],
      })
        ? "https://schema.org/OutOfStock"
        : "https://schema.org/InStock",
      url,
    },
  };
}

export function serializeJsonLd(value: unknown): string {
  return JSON.stringify(value).replace(/</g, "\\u003c");
}
