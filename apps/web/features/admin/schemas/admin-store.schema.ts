import type { StoreWithOwnerResponseDto } from "@biasmarket/types";

// Was a zod schema stripping the full Store record down to the fields the
// UI uses; now a type alias onto the generated response DTO — the backend
// response DTO is the runtime guarantee, see the OpenAPI note in
// apps/web/AGENTS.md.
export type AdminStore = StoreWithOwnerResponseDto;
