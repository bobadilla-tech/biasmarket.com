export { productsApi } from "./api/products.api";
export { categoriesApi } from "./api/categories.api";

export { productsKeys, useProducts } from "./queries/use-products";
export { categoriesKeys, useCategories } from "./queries/use-categories";
export { useProduct } from "./queries/use-product";

export { useCreateProduct } from "./mutations/use-create-product";
export { useUpdateProduct } from "./mutations/use-update-product";
export { useDeleteProduct } from "./mutations/use-delete-product";
export { usePublishProduct } from "./mutations/use-publish-product";
export { useEnsureCategory } from "./mutations/use-ensure-category";

export { stockTone } from "./lib/stock-tone";
export { getCategoryLabel } from "./lib/category-label";
export { keyForAttributes } from "./lib/variant-key";

export { ProductsHeader } from "./components/products-header";
export { ProductTile } from "./components/product-tile";
export { ProductRow } from "./components/product-row";
export { ProductSheet } from "./components/product-sheet";

export {
  categorySchema,
  categoryListSchema,
  type Category,
} from "./schemas/category.schema";
export {
  variantSchema,
  variantListSchema,
  type Variant,
  type VariantDraft,
  type OptionTypeDraft,
} from "./schemas/variant.schema";
export { productSchema, productListSchema, type Product } from "./schemas/product.schema";
export { productFormSchema, type ProductFormInput } from "./schemas/product-form.schema";
