/**
 * Maximum images per product. Single source for the add-image service check,
 * the reorder DTO and the `images` arrays on create/update. Anything else that
 * writes `Product.images` (a future importer included) must use it too.
 */
export const MAX_PRODUCT_IMAGES = 6;
