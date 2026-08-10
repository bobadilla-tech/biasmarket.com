export { productsApi } from "./api/products.api";

export { productsKeys, useProducts } from "./queries/use-products";
export { categoriesKeys, useCategories } from "./queries/use-categories";
export { useProduct } from "./queries/use-product";

export { useCreateProduct } from "./mutations/use-create-product";
export { useUpdateProduct } from "./mutations/use-update-product";
export { useDeleteProduct } from "./mutations/use-delete-product";
export { usePublishProduct } from "./mutations/use-publish-product";
export { useEnsureCategory } from "./mutations/use-ensure-category";

export { stockTone } from "./lib/stock-tone";
export {
  availabilityFlags,
  getProductAvailabilityState,
  type ProductAvailabilityState,
} from "./lib/availability-state";
export { getCategoryLabel } from "./lib/category-label";
export { keyForAttributes } from "./lib/variant-key";
export { getPublishedCatalogValue } from "./lib/catalog-value";

export { ProductsHeader } from "./components/products-header";
export { ProductTile } from "./components/product-tile";
export { ProductRow } from "./components/product-row";
export { ProductSheet } from "./components/product-sheet";

export type { OptionTypeDraft, VariantDraft } from "./schemas/variant.schema";
export {
  type ProductFormInput,
  productFormSchema,
} from "./schemas/product-form.schema";
