import type {
  DirectoryStoreItemResponseDto,
  StoreDirectoryResponseDto,
} from "@biasmarket/types";

// Was zod schemas for pass-through reads of Stores' findFeatured/
// findDirectory; now type aliases onto the generated response DTOs — see
// the OpenAPI note in apps/web/AGENTS.md. `StoreCard` renders both a
// featured-store row (extra revenue/orderCount fields) and a directory row
// through this same narrower shape — structurally compatible either way.
export type StoreListing = DirectoryStoreItemResponseDto;
export type StoreDirectoryResult = StoreDirectoryResponseDto;
