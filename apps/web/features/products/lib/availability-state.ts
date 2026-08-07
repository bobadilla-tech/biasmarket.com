export type ProductAvailabilityState =
  | "AVAILABLE"
  | "OUT_OF_STOCK"
  | "DISCONTINUED";

type ProductAvailabilitySource = {
  discontinued: boolean;
  soldOut: boolean;
  availableStock?: number | null;
};

export function getProductAvailabilityState(
  product: ProductAvailabilitySource,
): ProductAvailabilityState {
  if (product.discontinued) return "DISCONTINUED";
  if (product.soldOut) return "OUT_OF_STOCK";
  if (product.availableStock !== undefined && product.availableStock !== null) {
    return product.availableStock <= 0 ? "OUT_OF_STOCK" : "AVAILABLE";
  }
  return "AVAILABLE";
}

export function availabilityFlags(state: ProductAvailabilityState) {
  return {
    soldOut: state !== "AVAILABLE",
    discontinued: state === "DISCONTINUED",
  };
}