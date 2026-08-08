import type {
  CollectionWithProductsResponseDto,
  StoreSectionResponseDto,
} from "@biasmarket/types";
import type { RenderableSection } from "@/components/storefront/section-renderer";

// The builder's own section list (`StoreSectionResponseDto`) only carries
// `collectionId` — no product data. The preview pane needs real product grids,
// so this joins in `collections.findAll`'s already-hydrated
// (products + variants) response by `collectionId`. See
// docs/plans/2026-08-08-storefront-section-drag-drop-preview.md's "data
// hydration" gap for why this join can't be skipped.
export function hydrateSections(
  sections: StoreSectionResponseDto[],
  collections: CollectionWithProductsResponseDto[],
): RenderableSection[] {
  return [...sections]
    .filter((section) => !section.hidden)
    .sort((a, b) => a.position - b.position)
    .map((section) => {
      if (section.type === "COLLECTION") {
        const collection = collections.find((c) =>
          c.id === section.collectionId
        );
        return {
          id: section.id,
          type: section.type,
          collection: {
            name: collection?.name ?? "",
            products: collection?.products ?? [],
          },
        };
      }
      return {
        id: section.id,
        type: section.type,
        content: section.content,
      };
    });
}
