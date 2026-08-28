import { afterEach, expect, test, vi } from "vitest";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithProviders } from "@/test-utils/render-with-providers";

// Stub ImageGallery so the test observes exactly the `images` array
// product-detail-view computes (the #135 general-images + variant-override
// merge), without next/image or the gallery's own behavior in the way.
const galleryImages = vi.fn();
vi.mock("@/features/products/components/image-gallery", () => ({
  ImageGallery: ({ images }: { images: string[] }) => {
    galleryImages(images);
    return <div data-testid="gallery">{images.join("|")}</div>;
  },
}));

vi.mock("sonner", () => ({ toast: { success: vi.fn() } }));
vi.mock("@/features/restock", () => ({
  RestockInterestDialog: () => null,
}));

const { ProductDetailView } = await import("./product-detail-view");

afterEach(() => {
  vi.clearAllMocks();
});

type Variant = {
  id: string;
  name: string;
  stock: number | null;
  reserved: number;
  priceOverride: string | null;
  imageOverride: string | null;
};

function makeProduct(variants: Variant[]) {
  return {
    id: "p1",
    name: "Tee",
    description: "",
    price: "20",
    currency: "PEN",
    soldOut: false,
    images: ["g1.jpg", "g2.jpg"],
    variants,
  };
}

const variant = (
  over: Partial<Variant> & { id: string; name: string },
): Variant => ({
  stock: 5,
  reserved: 0,
  priceOverride: null,
  imageOverride: null,
  ...over,
});

function gallery() {
  return screen.getByTestId("gallery").textContent;
}

test("with no variant override the gallery is just the product's general images", () => {
  renderWithProviders(
    <ProductDetailView
      slug="s"
      product={makeProduct([variant({ id: "v1", name: "Red" })])}
    />,
  );

  expect(gallery()).toBe("g1.jpg|g2.jpg");
});

test("a variant override not in the general images is prepended", () => {
  renderWithProviders(
    <ProductDetailView
      slug="s"
      product={makeProduct([
        variant({ id: "v1", name: "Red", imageOverride: "red.jpg" }),
      ])}
    />,
  );

  expect(gallery()).toBe("red.jpg|g1.jpg|g2.jpg");
});

test("a variant override already among the general images leads without duplicating", () => {
  renderWithProviders(
    <ProductDetailView
      slug="s"
      product={makeProduct([
        variant({ id: "v1", name: "Red", imageOverride: "g2.jpg" }),
      ])}
    />,
  );

  expect(gallery()).toBe("g2.jpg|g1.jpg");
});

test("switching the variant select swaps the leading gallery image", async () => {
  const user = userEvent.setup();
  renderWithProviders(
    <ProductDetailView
      slug="s"
      product={makeProduct([
        variant({ id: "v1", name: "Red" }),
        variant({ id: "v2", name: "Blue", imageOverride: "blue.jpg" }),
      ])}
    />,
  );

  expect(gallery()).toBe("g1.jpg|g2.jpg");

  await user.selectOptions(screen.getByRole("combobox"), "v2");

  expect(gallery()).toBe("blue.jpg|g1.jpg|g2.jpg");
});
