import { fireEvent, render, screen } from "@testing-library/react-native";
import { describe, expect, it, jest } from "@jest/globals";
import { FeaturedStoreCard, ProductCard } from "./catalog-ui";

jest.mock("expo-image", () => ({ Image: () => null }));

describe("FeaturedStoreCard", () => {
  it("shows the store identity and opens it when selected", async () => {
    const onPress = jest.fn();
    await render(
      <FeaturedStoreCard
        store={{
          id: "store-1",
          name: "Moon Shop",
          slug: "moon-shop",
          logoUrl: null,
          revenue: 0,
          orderCount: 0,
        }}
        onPress={onPress}
      />,
    );

    expect(screen.getByText("Moon Shop")).toBeTruthy();
    expect(screen.getByText("@moon-shop")).toBeTruthy();
    await fireEvent.press(screen.getByRole("button"));
    expect(onPress).toHaveBeenCalledTimes(1);
  });
});

describe("ProductCard", () => {
  it("shows the product and invokes its navigation callback", async () => {
    const onPress = jest.fn();
    await render(
      <ProductCard
        product={{
          id: "product-1",
          name: "Test album",
          price: "12.5",
          currency: "PEN",
          images: [],
          store: { name: "Moon Shop", slug: "moon-shop" },
        }}
        onPress={onPress}
      />,
    );
    expect(screen.getByText("Test album")).toBeTruthy();
    await fireEvent.press(screen.getByRole("button"));
    expect(onPress).toHaveBeenCalledTimes(1);
  });
});
